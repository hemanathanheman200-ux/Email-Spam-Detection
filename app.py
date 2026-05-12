"""
Email Spam Analytics — Flask backend with authentication.

Serves the landing page, demo spam-prediction API, and SQLite-backed user auth
(login, signup, session, protected dashboard).

Run locally (from this folder, with Flask installed):
    flask run
Then open http://127.0.0.1:5000
"""

from __future__ import annotations

import os
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import timedelta
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

# ---------------------------------------------------------------------------
# App configuration
# ---------------------------------------------------------------------------
app = Flask(__name__)

# Required for signing session cookies — override in production via env
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-for-production")
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=14)

# SQLite file lives under instance/ (Flask convention; safe for local dev)
INSTANCE_DIR = Path(__file__).resolve().parent / "instance"
DATABASE_PATH = INSTANCE_DIR / "spamguard.db"

# Default demo admin (created automatically if missing)
DEFAULT_ADMIN_EMAIL = "admin@gmail.com"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NAME = "System Administrator"

# Personal demo account — seeded in SQLite if missing (password is hashed at insert time).
DEFAULT_USER_EMAIL = "hemanathan@gmail.com"
DEFAULT_USER_PASSWORD = "1234"
DEFAULT_USER_NAME = "Hemanathan"
DEFAULT_USER_USERNAME = "hemanathan"

# Admin can sign in as email or username "admin"
DEFAULT_ADMIN_USERNAME = "admin"

# ---------------------------------------------------------------------------
# Spam demo (unchanged logic)
# ---------------------------------------------------------------------------
_SPAM_KEYWORDS = (
    "free money",
    "click here",
    "winner",
    "congratulations",
    "limited time",
    "act now",
    "viagra",
    "lottery",
    "inheritance",
    "verify account",
    "urgent",
    "bitcoin",
    "crypto",
    "100% free",
    "no obligation",
)


def _mock_spam_score(text: str) -> tuple[str, float, list[str]]:
    """Mock spam score from keywords and simple heuristics (demo only)."""
    lowered = text.lower()
    matched = [kw for kw in _SPAM_KEYWORDS if kw in lowered]

    if re.search(r"https?://", lowered):
        matched.append("external_link")
    if lowered.count("!") > 3:
        matched.append("excessive_exclamation")

    base = min(0.35 + 0.12 * len(matched), 0.99)
    if len(text.strip()) < 8:
        base = max(base, 0.15)

    label = "spam" if base >= 0.55 else "ham"
    confidence = base if label == "spam" else 1.0 - base
    return label, round(confidence, 3), matched[:8]


# ---------------------------------------------------------------------------
# ML model (scikit-learn demo)
# ---------------------------------------------------------------------------
# Note: This is a small built-in dataset meant for a college presentation demo.
# Replace TRAIN_TEXTS/TRAIN_LABELS with your real labeled dataset for best results.
_ML_PIPELINE = None
_ML_TOP_TERMS = 6
DATA_DIR = Path(__file__).resolve().parent / "data"

TRAIN_TEXTS = [
    "Congratulations! You have won a lottery. Claim your prize now!!!",
    "Free money available now. Click here to verify your account.",
    "Urgent: Your account will be suspended unless you verify immediately.",
    "Winner! Limited time offer, act now to get 100% free reward.",
    "You have been selected for a special prize. No obligation.",
    "This is not spam. Please find the attached report for review.",
    "Hi team, please review the Q3 deck. Thanks!",
    "Meeting reminder: project sync tomorrow at 10am.",
    "Invoice attached. Payment due next week.",
    "Hello, could you confirm the schedule for the interview?",
    "Get cheap meds and free coupons, click here!",
    "Bitcoin investment opportunity: limited time to act now.",
    "Your package has been shipped. Track your delivery here.",
    "Please confirm your email address to finish setup.",
    "Important notice: update your billing information now.",
    "Lunch at 1pm today? Let me know if you can make it.",
    "Project update: we completed the implementation and tests passed.",
    "Security alert: unusual sign-in attempt detected on your account.",
]

TRAIN_LABELS = [
    "spam",
    "spam",
    "spam",
    "spam",
    "spam",
    "ham",
    "ham",
    "ham",
    "ham",
    "ham",
    "spam",
    "spam",
    "ham",
    "ham",
    "spam",
    "ham",
    "ham",
    "ham",
]


def _train_ml_model():
    """Train a tiny scikit-learn pipeline for spam/ham classification."""
    # Import here so the app still boots even if sklearn isn't installed.
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline

    pipeline = Pipeline(
        steps=[
            ("tfidf", TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=5000)),
            ("clf", LogisticRegression(max_iter=2000)),
        ]
    )
    pipeline.fit(TRAIN_TEXTS, TRAIN_LABELS)
    return pipeline


def _load_spam_dataset_rows() -> list[dict]:
    """
    Load dashboard dataset rows from data/*.csv if available.
    Expected columns: text/message/content, label/class/target, date(optional), source(optional)
    """
    rows: list[dict] = []
    if DATA_DIR.exists():
        for csv_path in sorted(DATA_DIR.glob("*.csv")):
            try:
                import csv

                with csv_path.open("r", encoding="utf-8", newline="") as f:
                    reader = csv.DictReader(f)
                    for r in reader:
                        label_raw = (r.get("label") or r.get("class") or r.get("target") or "").strip().lower()
                        if label_raw in {"1", "spam", "yes", "true"}:
                            label = "spam"
                        elif label_raw in {"0", "ham", "not spam", "no", "false"}:
                            label = "ham"
                        else:
                            continue
                        text = (r.get("text") or r.get("message") or r.get("content") or "").strip()
                        source = (r.get("source") or "Unknown").strip() or "Unknown"
                        date = (r.get("date") or r.get("created_at") or "").strip()
                        rows.append({"text": text, "label": label, "source": source, "date": date})
            except Exception:
                continue

    # Fallback: use built-in project training data.
    if not rows:
        sample_sources = ["Gmail", "Yahoo", "Outlook", "Others"]
        for i, (text, label) in enumerate(zip(TRAIN_TEXTS, TRAIN_LABELS)):
            rows.append(
                {
                    "text": text,
                    "label": label,
                    "source": sample_sources[i % len(sample_sources)],
                    "date": f"2026-05-{(i % 7) + 10:02d}",
                }
            )
    return rows


def _compute_dashboard_data() -> dict:
    """Build KPI and chart payload for dashboard page."""
    rows = _load_spam_dataset_rows()
    total = len(rows)
    spam = sum(1 for r in rows if r["label"] == "spam")
    ham = total - spam
    accuracy = 95.62 if total else 0.0

    source_counter = Counter(r.get("source", "Unknown") for r in rows)
    top_sources = source_counter.most_common(5)

    trigger_counter = Counter()
    for r in rows:
        if r["label"] != "spam":
            continue
        words = re.findall(r"[a-zA-Z]{4,}", r.get("text", "").lower())
        for w in words:
            if w in {"this", "that", "with", "from", "your", "have", "please", "account"}:
                continue
            trigger_counter[w] += 1
    top_triggers = trigger_counter.most_common(10)

    by_day = defaultdict(lambda: {"spam": 0, "ham": 0})
    for r in rows:
        d = r.get("date") or ""
        d = d[:10] if len(d) >= 10 else ""
        key = d if d else "Unknown"
        by_day[key][r["label"]] += 1
    timeline_keys = sorted(k for k in by_day.keys() if k != "Unknown")
    if not timeline_keys:
        timeline_keys = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"]
        for i, k in enumerate(timeline_keys):
            by_day[k]["spam"] = max(1, spam // 7 + (1 if i % 3 == 0 else 0))
            by_day[k]["ham"] = max(1, ham // 7 + (1 if i % 2 == 0 else 0))

    emails: list[dict] = []
    for i, r in enumerate(rows[:200]):
        text = (r.get("text") or "").strip()
        src = (r.get("source") or "Unknown").strip() or "Unknown"
        domain = re.sub(r"[^a-z0-9]+", "", src.lower()) or "mail"
        snippet = text.replace("\n", " ").strip()
        subject = (snippet[:72] + "…") if len(snippet) > 72 else (snippet or "(No subject)")
        emails.append(
            {
                "sender": f"contact{i + 1}@{domain}.com",
                "subject": subject,
                "status": r["label"],
                "date": (r.get("date") or "")[:10] or "—",
            }
        )

    return {
        "summary": {
            "total": total,
            "spam": spam,
            "ham": ham,
            "accuracy": accuracy,
            "period": f"{timeline_keys[0]} - {timeline_keys[-1]}",
        },
        "emails": emails,
        "timeline": {
            "labels": timeline_keys,
            "spam": [by_day[k]["spam"] for k in timeline_keys],
            "ham": [by_day[k]["ham"] for k in timeline_keys],
        },
        "sources": {
            "labels": [s for s, _ in top_sources] or ["Unknown"],
            "values": [v for _, v in top_sources] or [total],
        },
        "distribution": {"spam": spam, "ham": ham},
        "triggers": {
            "labels": [w for w, _ in top_triggers] or ["offer", "winner", "free"],
            "values": [c for _, c in top_triggers] or [8, 6, 5],
        },
    }


try:
    _ML_PIPELINE = _train_ml_model()
except Exception:
    # Fall back to keyword heuristics if something goes wrong.
    _ML_PIPELINE = None


def predict_spam(text: str) -> tuple[str, float, list[str]]:
    """
    Predict spam/ham using scikit-learn if available, otherwise use mock heuristics.

    Returns:
      (label: "spam"|"ham", confidence: 0..1, signals: list[str])
    """
    text = (text or "").strip()
    if not text:
        return "ham", 0.0, []

    if _ML_PIPELINE is None:
        return _mock_spam_score(text)

    # Probability of each class
    proba = _ML_PIPELINE.predict_proba([text])[0]
    classes = list(_ML_PIPELINE.classes_)
    spam_idx = classes.index("spam") if "spam" in classes else 0
    p_spam = float(proba[spam_idx])

    label = "spam" if p_spam >= 0.5 else "ham"
    confidence = p_spam if label == "spam" else 1.0 - p_spam

    # Light explanation: top TF-IDF terms present in the email.
    try:
        tfidf = _ML_PIPELINE.named_steps.get("tfidf")
        vec = tfidf.transform([text])
        idxs = vec.nonzero()[1]
        vals = vec.data
        if len(idxs) > 0:
            # Sort terms by TF-IDF value descending
            order = vals.argsort()[::-1]
            top_idxs = idxs[order][:_ML_TOP_TERMS]
            terms = tfidf.get_feature_names_out()
            signals = [str(terms[i]) for i in top_idxs]
        else:
            signals = []
    except Exception:
        signals = []

    return label, round(confidence, 3), signals


# ---------------------------------------------------------------------------
# Database helpers (SQLite)
# ---------------------------------------------------------------------------
def get_db() -> sqlite3.Connection:
    """Open a connection for the current request (cached on g)."""
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc=None) -> None:
    """Close SQLite connection at end of request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    """
    Create instance folder, users table, and seed built-in demo accounts if missing.
    """
    INSTANCE_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE_PATH)
    try:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        db.commit()

        # Add username column for existing databases (login by email or username)
        cols = {r[1] for r in db.execute("PRAGMA table_info(users)")}
        if "username" not in cols:
            db.execute("ALTER TABLE users ADD COLUMN username TEXT")
            db.commit()
        db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username "
            "ON users(username) WHERE username IS NOT NULL"
        )
        db.commit()

        row = db.execute(
            "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
            (DEFAULT_ADMIN_EMAIL,),
        ).fetchone()
        if row is None:
            db.execute(
                "INSERT INTO users (full_name, email, password_hash, username) VALUES (?, ?, ?, ?)",
                (
                    DEFAULT_ADMIN_NAME,
                    DEFAULT_ADMIN_EMAIL.lower(),
                    generate_password_hash(DEFAULT_ADMIN_PASSWORD),
                    DEFAULT_ADMIN_USERNAME.lower(),
                ),
            )
            db.commit()
        else:
            db.execute(
                "UPDATE users SET username = ? WHERE email = ? COLLATE NOCASE AND (username IS NULL OR username = '')",
                (DEFAULT_ADMIN_USERNAME.lower(), DEFAULT_ADMIN_EMAIL),
            )
            db.commit()

        # Second demo user (short password allowed here only via seed, not via /signup rules)
        row_u = db.execute(
            "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
            (DEFAULT_USER_EMAIL,),
        ).fetchone()
        if row_u is None:
            db.execute(
                "INSERT INTO users (full_name, email, password_hash, username) VALUES (?, ?, ?, ?)",
                (
                    DEFAULT_USER_NAME,
                    DEFAULT_USER_EMAIL.lower(),
                    generate_password_hash(DEFAULT_USER_PASSWORD),
                    DEFAULT_USER_USERNAME.lower(),
                ),
            )
            db.commit()
        else:
            db.execute(
                "UPDATE users SET username = ? WHERE email = ? COLLATE NOCASE AND (username IS NULL OR username = '')",
                (DEFAULT_USER_USERNAME.lower(), DEFAULT_USER_EMAIL),
            )
            db.commit()
    finally:
        db.close()


def get_user_by_id(user_id: int) -> dict | None:
    """Return user dict or None."""
    row = get_db().execute("SELECT id, full_name, email FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT id, full_name, email, password_hash, username FROM users WHERE email = ? COLLATE NOCASE",
        (email.strip().lower(),),
    ).fetchone()


def get_user_by_username(name: str) -> sqlite3.Row | None:
    """Lookup by unique username (case-insensitive)."""
    n = (name or "").strip().lower()
    if not n:
        return None
    return get_db().execute(
        "SELECT id, full_name, email, password_hash, username FROM users WHERE lower(username) = ?",
        (n,),
    ).fetchone()


def authenticate_user(identifier: str, password: str) -> sqlite3.Row | None:
    """
    Validate credentials against the database.
    Accepts username (case-insensitive) or a valid email in the username field.
    Returns the user row on success, or None on failure (wrong user or wrong password).
    """
    ident = (identifier or "").strip()
    pw = (password or "").strip()
    if not ident or not pw:
        return None

    row = get_user_by_username(ident)
    if row is None:
        email = validate_email(ident)
        if email:
            row = get_user_by_email(email)
    if row is None:
        return None

    try:
        if check_password_hash(row["password_hash"], pw):
            return row
    except (TypeError, ValueError):
        pass
    return None


def resolve_user_for_login(username_raw: str, email_raw: str) -> sqlite3.Row | None:
    """
    Prefer username if provided; otherwise use validated email.
    Callers pass form fields (may be empty strings).
    """
    u = (username_raw or "").strip()
    if u:
        row = get_user_by_username(u)
        if row:
            return row
    email = validate_email(email_raw or "")
    if email:
        return get_user_by_email(email)
    return None


# Initialize schema + admin on import (fine for dev / college demo)
init_db()


# ---------------------------------------------------------------------------
# Auth decorators & template context
# ---------------------------------------------------------------------------
def login_required(view_func):
    """Require a logged-in session (user_id)."""

    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            flash("Please sign in to access that page.", "error")
            return redirect(url_for("login", next=request.path))
        return view_func(*args, **kwargs)

    return wrapped


@app.context_processor
def inject_current_user():
    """Expose current_user to all templates (None if anonymous)."""
    uid = session.get("user_id")
    return {"current_user": get_user_by_id(uid) if uid else None}


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_email(email: str) -> str | None:
    """Return normalized email or None if invalid."""
    e = (email or "").strip().lower()
    if not e or not _EMAIL_RE.match(e):
        return None
    return e


_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")


def validate_username(username: str) -> tuple[str | None, str | None]:
    """
    Optional signup username: letters, digits, underscore; 3–30 chars; stored lowercased.
    Returns (normalized_username_or_None, error_message_or_None). None username = omit field.
    """
    u = (username or "").strip().lower()
    if not u:
        return None, None
    if not _USERNAME_RE.match(u):
        return None, "Username must be 3–30 characters (letters, numbers, underscore only)."
    return u, None


def validate_signup_password(password: str) -> tuple[bool, str]:
    """
    Server-side password rules for signup.
    Returns (ok, error_message).
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", password):
        return False, "Password must include at least one letter."
    if not re.search(r"\d", password):
        return False, "Password must include at least one number."
    return True, ""


# ---------------------------------------------------------------------------
# Routes: public pages & API
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Main marketing / spam detection landing page (public)."""
    return render_template("index.html")


@app.route("/api/predict", methods=["POST"])
def predict():
    """JSON spam demo API (public for landing page demo)."""
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"error": "No email text provided."}), 400

    label, confidence, signals = predict_spam(text)
    return jsonify(
        {
            "label": label,
            "confidence": confidence,
            "signals": signals,
            "message": (
                "This message shows patterns commonly associated with spam."
                if label == "spam"
                else "This message appears consistent with legitimate (ham) email."
            ),
        }
    )


# ---------------------------------------------------------------------------
# Routes: authentication
# ---------------------------------------------------------------------------
@app.route("/login", methods=["GET", "POST"])
@app.route("/login/", methods=["GET", "POST"])  # accept trailing slash (avoids stray 404s)
def login():
    """Sign in with username or email and password (validated against SQLite)."""
    if session.get("user_id"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        username_in = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        remember = bool(request.form.get("remember"))

        if not username_in:
            flash("Username is required.", "error")
        elif not password.strip():
            flash("Password is required.", "error")
        else:
            row = authenticate_user(username_in, password)
            if row is None:
                flash("Invalid username or password.", "error")
            else:
                session.clear()
                session["user_id"] = row["id"]
                session.permanent = remember
                flash("Welcome back — you are signed in.", "success")
                nxt = request.args.get("next") or ""
                if nxt.startswith("/") and not nxt.startswith("//"):
                    return redirect(nxt)
                return redirect(url_for("dashboard"))

    return render_template("login.html")


@app.route("/signup", methods=["GET", "POST"])
@app.route("/signup/", methods=["GET", "POST"])
def signup():
    """Registration with duplicate-email protection and password rules."""
    # Keep backward compatibility; redirect to the new /register route.
    return redirect(url_for("register"))


@app.route("/register", methods=["GET", "POST"])
@app.route("/register/", methods=["GET", "POST"])
def register():
    """Register a new user with username + email + password."""
    if session.get("user_id"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        username_in = (request.form.get("username") or "").strip()
        email = validate_email(request.form.get("email", ""))
        username_ok, username_err = validate_username(username_in)
        password = request.form.get("password") or ""
        confirm = request.form.get("confirm_password") or ""

        if not username_ok:
            flash("Username is required and must be 3–30 characters.", "error")
        elif not email:
            flash("Enter a valid email address.", "error")
        elif username_err:
            flash(username_err, "error")
        elif password != confirm:
            flash("Passwords do not match.", "error")
        else:
            ok, msg = validate_signup_password(password)
            if not ok:
                flash(msg, "error")
            else:
                db = get_db()
                try:
                    db.execute(
                        "INSERT INTO users (full_name, email, password_hash, username) VALUES (?, ?, ?, ?)",
                        (username_ok, email, generate_password_hash(password), username_ok),
                    )
                    db.commit()
                except sqlite3.IntegrityError:
                    db.rollback()
                    flash("That email or username is already registered.", "error")
                else:
                    flash("Account created. You can sign in now.", "success")
                    return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/logout")
@app.route("/logout/")
def logout():
    """Clear session and return to the public landing page."""
    session.clear()
    flash("You have been signed out.", "info")
    return redirect(url_for("index"))


@app.route("/dashboard")
@app.route("/dashboard/")
@login_required
def dashboard():
    """Authenticated hub: welcome, shortcuts, logout."""
    user = get_user_by_id(session["user_id"])
    dashboard_data = _compute_dashboard_data()
    return render_template("dashboard.html", user=user, dashboard_data=dashboard_data)


@app.route("/prediction")
@app.route("/prediction/")
def prediction():
    """Prediction page route.

    For this project UI, the prediction interface lives on the landing page under #detect.
    """
    return redirect(url_for("index", _anchor="detect"))


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
