"""
╔══════════════════════════════════════════════════════════════╗
║           MediTrack – Medicine Schedule & Stock Reminder      ║
║           Student ID : RJ1P24K  |  Roll: 1A19                ║
╚══════════════════════════════════════════════════════════════╝

Description:
    MediTrack is a console-based Python application that helps users
    manage their medicine schedules, track dosage timings, monitor
    available stock, detect missed doses, and receive low-stock alerts.

Key Features:
    - Add / view / delete medicines
    - Schedule multiple daily doses per medicine
    - Mark doses as taken
    - Detect missed or upcoming doses (based on current time)
    - Low-stock alerts (threshold: 5 tablets)
    - Persistent storage via JSON file
    - Sample data auto-loaded on first run
    - Full input validation and exception handling

Python Concepts Used:
    - Data structures  : dict, list, nested structures
    - Functions        : modular design with single responsibility
    - File handling    : json.load / json.dump for persistence
    - Date/time        : datetime module for schedule logic
    - Validation       : try/except, regex, range checks
    - Exception handling: custom exceptions + standard ones
    - String formatting : f-strings, tabulate-style display
    - Control flow     : loops, conditionals, match (Python 3.10+)
"""

# ── Standard-library imports ───────────────────────────────────────────────────
import json
import os
import re
import sys
from datetime import datetime, timedelta, date
from typing import Optional

# ── Constants ──────────────────────────────────────────────────────────────────
DATA_FILE        = os.path.join(os.path.dirname(__file__), "meditrack_data.json")
LOW_STOCK_LIMIT  = 5          # tablets – alert when stock falls at or below this
MISSED_WINDOW    = 60         # minutes – a dose is "missed" if this many mins past scheduled time
DATE_FMT         = "%Y-%m-%d"
TIME_FMT         = "%H:%M"
SEPARATOR        = "─" * 65


# ══════════════════════════════════════════════════════════════════════════════
# Custom Exceptions
# ══════════════════════════════════════════════════════════════════════════════
class MediTrackError(Exception):
    """Base exception for all MediTrack errors."""

class DuplicateMedicineError(MediTrackError):
    """Raised when a medicine with the same name already exists."""

class MedicineNotFoundError(MediTrackError):
    """Raised when the requested medicine does not exist."""

class InvalidDateError(MediTrackError):
    """Raised when a date string cannot be parsed or is logically invalid."""

class InvalidTimeError(MediTrackError):
    """Raised when a time string cannot be parsed."""

class InvalidStockError(MediTrackError):
    """Raised when stock quantity is non-positive or non-integer."""


# ══════════════════════════════════════════════════════════════════════════════
# Utility / Validation helpers
# ══════════════════════════════════════════════════════════════════════════════
def validate_date(date_str: str) -> date:
    """
    Parse and validate a date string in YYYY-MM-DD format.

    Args:
        date_str: String representation of a date.

    Returns:
        A datetime.date object.

    Raises:
        InvalidDateError: If the string is malformed or the date is in the past
                          when used as a start date.
    """
    try:
        parsed = datetime.strptime(date_str.strip(), DATE_FMT).date()
        return parsed
    except ValueError:
        raise InvalidDateError(
            f"'{date_str}' is not a valid date. Use YYYY-MM-DD (e.g. 2026-11-20)."
        )


def validate_time(time_str: str) -> str:
    """
    Validate a time string in HH:MM (24-hour) format.

    Args:
        time_str: String representation of time.

    Returns:
        Normalised HH:MM string.

    Raises:
        InvalidTimeError: If the string cannot be parsed.
    """
    try:
        t = datetime.strptime(time_str.strip(), TIME_FMT)
        return t.strftime(TIME_FMT)   # normalise (zero-pad)
    except ValueError:
        raise InvalidTimeError(
            f"'{time_str}' is not a valid time. Use HH:MM in 24-hour format (e.g. 08:30)."
        )


def validate_stock(value: str) -> int:
    """
    Validate that the stock value is a positive integer.

    Args:
        value: Raw string from user input.

    Returns:
        Integer stock count.

    Raises:
        InvalidStockError: If value is not a positive integer.
    """
    try:
        qty = int(value.strip())
        if qty <= 0:
            raise InvalidStockError("Stock quantity must be a positive integer.")
        return qty
    except ValueError:
        raise InvalidStockError(f"'{value}' is not a valid integer for stock quantity.")


def validate_medicine_name(name: str) -> str:
    """
    Validate that the medicine name is non-empty and alphanumeric (spaces/hyphens OK).

    Args:
        name: Raw medicine name from user input.

    Returns:
        Stripped and title-cased name.

    Raises:
        ValueError: If name is empty or contains invalid characters.
    """
    name = name.strip()
    if not name:
        raise ValueError("Medicine name cannot be empty.")
    if not re.match(r"^[A-Za-z0-9\s\-\.]+$", name):
        raise ValueError(
            "Medicine name may only contain letters, numbers, spaces, hyphens, or dots."
        )
    return name.title()


# ══════════════════════════════════════════════════════════════════════════════
# Data-layer: load / save / seed sample data
# ══════════════════════════════════════════════════════════════════════════════
def load_data() -> dict:
    """
    Load the medicine database from the JSON file.

    Returns:
        A dict with key 'medicines' mapping to a list of medicine records.
        Returns an empty structure if the file is absent or corrupt.
    """
    if not os.path.exists(DATA_FILE):
        return {"medicines": []}
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        # Structural sanity check
        if "medicines" not in data or not isinstance(data["medicines"], list):
            raise ValueError("Unexpected JSON structure.")
        return data
    except (json.JSONDecodeError, ValueError) as exc:
        print(f"\n[WARNING] Data file is corrupt ({exc}). Starting fresh.\n")
        return {"medicines": []}


def save_data(data: dict) -> None:
    """
    Persist the medicine database to the JSON file.

    Args:
        data: The full data dict to serialise.

    Raises:
        IOError: Propagated if the file cannot be written.
    """
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=4, default=str)
    except IOError as exc:
        print(f"\n[ERROR] Could not save data: {exc}\n")
        raise


def seed_sample_data(data: dict) -> None:
    """
    Populate the database with sample medicines so the app works
    immediately without manual entry.

    Sample medicines:
        1. Paracetamol  – 3×/day, start today,  stock 20
        2. Amoxicillin  – 2×/day, start today,  stock 14
        3. Metformin    – 2×/day, start today,  stock  4  (low stock demo)
        4. Vitamin D3   – 1×/day, start today,  stock 30
        5. Cetirizine   – 1×/day, start today,  stock  3  (low stock demo)

    Args:
        data: The database dict (mutated in-place).
    """
    today        = date.today().isoformat()
    end_date     = (date.today() + timedelta(days=30)).isoformat()

    sample = [
        {
            "id"          : 1,
            "name"        : "Paracetamol 500mg",
            "dosage"      : "1 tablet",
            "stock"       : 20,
            "start_date"  : today,
            "end_date"    : end_date,
            "schedule"    : ["08:00", "14:00", "21:00"],   # three doses per day
            "taken_today" : [],   # list of HH:MM strings marked taken today
            "taken_log"   : [],   # historical log [{date, time}]
            "notes"       : "Take after meals. For fever / pain relief.",
        },
        {
            "id"          : 2,
            "name"        : "Amoxicillin 250mg",
            "dosage"      : "1 capsule",
            "stock"       : 14,
            "start_date"  : today,
            "end_date"    : (date.today() + timedelta(days=7)).isoformat(),
            "schedule"    : ["09:00", "21:00"],
            "taken_today" : [],
            "taken_log"   : [],
            "notes"       : "Complete the full antibiotic course.",
        },
        {
            "id"          : 3,
            "name"        : "Metformin 500mg",
            "dosage"      : "1 tablet",
            "stock"       : 4,                             # intentionally low
            "start_date"  : today,
            "end_date"    : end_date,
            "schedule"    : ["08:30", "20:30"],
            "taken_today" : [],
            "taken_log"   : [],
            "notes"       : "Take with food to reduce stomach upset.",
        },
        {
            "id"          : 4,
            "name"        : "Vitamin D3 1000IU",
            "dosage"      : "1 tablet",
            "stock"       : 30,
            "start_date"  : today,
            "end_date"    : (date.today() + timedelta(days=30)).isoformat(),
            "schedule"    : ["09:00"],
            "taken_today" : [],
            "taken_log"   : [],
            "notes"       : "Best absorbed with a meal containing fat.",
        },
        {
            "id"          : 5,
            "name"        : "Cetirizine 10mg",
            "dosage"      : "1 tablet",
            "stock"       : 3,                             # intentionally low
            "start_date"  : today,
            "end_date"    : (date.today() + timedelta(days=5)).isoformat(),
            "schedule"    : ["22:00"],
            "taken_today" : [],
            "taken_log"   : [],
            "notes"       : "Take at bedtime. May cause drowsiness.",
        },
    ]
    data["medicines"] = sample
    save_data(data)
    print("\n✔  Sample data loaded successfully!\n")


# ══════════════════════════════════════════════════════════════════════════════
# Core logic helpers
# ══════════════════════════════════════════════════════════════════════════════
def _next_id(data: dict) -> int:
    """Return the next available integer ID."""
    ids = [m["id"] for m in data["medicines"]]
    return max(ids) + 1 if ids else 1


def _find_medicine(data: dict, name_or_id: str) -> Optional[dict]:
    """
    Search for a medicine by name (case-insensitive) or by string ID.

    Args:
        data         : Full database dict.
        name_or_id   : User-supplied search term.

    Returns:
        The medicine dict if found, else None.
    """
    term = name_or_id.strip()
    # Try numeric ID first
    if term.isdigit():
        mid = int(term)
        for m in data["medicines"]:
            if m["id"] == mid:
                return m
    # Try name (case-insensitive, partial match)
    for m in data["medicines"]:
        if term.lower() in m["name"].lower():
            return m
    return None


def _is_active(medicine: dict) -> bool:
    """Return True if today falls within the medicine's start–end date range."""
    try:
        start = date.fromisoformat(medicine["start_date"])
        end   = date.fromisoformat(medicine["end_date"])
        return start <= date.today() <= end
    except (ValueError, KeyError):
        return False


def _reset_taken_today_if_new_day(medicine: dict) -> None:
    """
    Clear the taken_today list when a new calendar day is detected.
    Uses a 'last_reset_date' field to track the last reset.
    Mutates the dict in-place (caller must save afterwards).
    """
    today_str = date.today().isoformat()
    if medicine.get("last_reset_date") != today_str:
        medicine["taken_today"]    = []
        medicine["last_reset_date"] = today_str


def _dose_status(medicine: dict, slot: str, now: datetime) -> str:
    """
    Determine the status of a single dose slot.

    Returns one of: 'taken' | 'missed' | 'upcoming' | 'due'
    """
    if slot in medicine.get("taken_today", []):
        return "taken"
    slot_dt = datetime.combine(date.today(), datetime.strptime(slot, TIME_FMT).time())
    delta   = (now - slot_dt).total_seconds() / 60   # minutes past slot time
    if delta > MISSED_WINDOW:
        return "missed"
    if delta >= 0:
        return "due"
    return "upcoming"


def _status_icon(status: str) -> str:
    """Map a status string to a display icon."""
    return {"taken": "✔", "missed": "✘", "due": "⏰", "upcoming": "🕐"}.get(status, "?")


# ══════════════════════════════════════════════════════════════════════════════
# Display helpers
# ══════════════════════════════════════════════════════════════════════════════
def print_header() -> None:
    """Print the application banner."""
    print("\n" + "═" * 65)
    print("  💊  MediTrack – Medicine Schedule & Stock Reminder")
    print(f"       Date: {date.today():%d %B %Y}   Time: {datetime.now():%H:%M}")
    print("═" * 65)


def print_menu() -> None:
    """Display the main menu."""
    print(f"\n{SEPARATOR}")
    print("  MAIN MENU")
    print(SEPARATOR)
    print("  1. 📋  View All Medicines & Today's Schedule")
    print("  2. ➕  Add New Medicine")
    print("  3. 💊  Mark Dose as Taken")
    print("  4. 🔔  Show Alerts (Missed / Upcoming / Low Stock)")
    print("  5. 📦  Update Stock")
    print("  6. 🔍  Search Medicine")
    print("  7. 🗑️   Delete Medicine")
    print("  8. 📜  View Dose History")
    print("  9. ❌  Exit")
    print(SEPARATOR)


def display_medicine_card(medicine: dict, now: Optional[datetime] = None) -> None:
    """
    Print a formatted card for a single medicine showing schedule status.

    Args:
        medicine : Medicine record dict.
        now      : Current datetime (defaults to datetime.now()).
    """
    if now is None:
        now = datetime.now()

    _reset_taken_today_if_new_day(medicine)   # ensure fresh state

    active_tag = "Active  ✔" if _is_active(medicine) else "Inactive ✘"
    low_tag    = " ⚠ LOW STOCK!" if medicine["stock"] <= LOW_STOCK_LIMIT else ""

    print(f"\n  {'─'*61}")
    print(f"  ID: {medicine['id']}  │  {medicine['name'].upper()}")
    print(f"  {'─'*61}")
    print(f"  Dosage    : {medicine['dosage']}")
    print(f"  Stock     : {medicine['stock']} units{low_tag}")
    print(f"  Period    : {medicine['start_date']}  →  {medicine['end_date']}")
    print(f"  Status    : {active_tag}")
    if medicine.get("notes"):
        print(f"  Notes     : {medicine['notes']}")
    print(f"  Schedule  :")
    for slot in medicine.get("schedule", []):
        status = _dose_status(medicine, slot, now)
        icon   = _status_icon(status)
        print(f"             {icon}  {slot}  [{status.upper()}]")


# ══════════════════════════════════════════════════════════════════════════════
# Feature functions (one per menu option)
# ══════════════════════════════════════════════════════════════════════════════

# ── 1. View all medicines ─────────────────────────────────────────────────────
def view_all_medicines(data: dict) -> None:
    """Display all medicines with today's schedule status."""
    print(f"\n{'═'*65}")
    print("  📋  ALL MEDICINES & TODAY'S SCHEDULE")
    print(f"{'═'*65}")

    if not data["medicines"]:
        print("  No medicines found. Add one using option 2.")
        return

    now = datetime.now()
    for med in data["medicines"]:
        display_medicine_card(med, now)
    save_data(data)   # persist any taken_today resets


# ── 2. Add new medicine ───────────────────────────────────────────────────────
def add_medicine(data: dict) -> None:
    """
    Interactively collect medicine details and add to the database.

    Validation applied:
        - Non-empty, alphanumeric name; no duplicates
        - Dosage description non-empty
        - Start date ≥ today; end date > start date (YYYY-MM-DD)
        - At least one schedule time in HH:MM
        - Stock is a positive integer
    """
    print(f"\n{'═'*65}\n  ➕  ADD NEW MEDICINE\n{'═'*65}")
    try:
        # ── Name ──────────────────────────────────────────────────────────────
        name = validate_medicine_name(input("  Medicine name       : "))
        # Duplicate check (case-insensitive)
        for m in data["medicines"]:
            if m["name"].lower() == name.lower():
                raise DuplicateMedicineError(
                    f"'{name}' already exists (ID {m['id']}). Use 'Update Stock' to refill."
                )

        # ── Dosage ────────────────────────────────────────────────────────────
        dosage = input("  Dosage (e.g. 1 tablet, 5ml)  : ").strip()
        if not dosage:
            raise ValueError("Dosage description cannot be empty.")

        # ── Stock ─────────────────────────────────────────────────────────────
        stock = validate_stock(input("  Initial stock (units): "))

        # ── Dates ─────────────────────────────────────────────────────────────
        start_str = input("  Start date (YYYY-MM-DD, leave blank for today): ").strip()
        if not start_str:
            start_date = date.today()
        else:
            start_date = validate_date(start_str)
            if start_date < date.today():
                raise InvalidDateError("Start date cannot be in the past.")

        end_str  = input("  End date   (YYYY-MM-DD): ").strip()
        end_date = validate_date(end_str)
        if end_date <= start_date:
            raise InvalidDateError("End date must be after the start date.")

        # ── Schedule ──────────────────────────────────────────────────────────
        print("  Enter dose times in HH:MM (24h). Type 'done' to finish.")
        schedule: list[str] = []
        while True:
            t_input = input(f"    Time #{len(schedule)+1} (or 'done'): ").strip()
            if t_input.lower() in {"done", "d", ""}:
                if not schedule:
                    print("    ⚠  At least one time is required.")
                    continue
                break
            try:
                t_val = validate_time(t_input)
                if t_val in schedule:
                    print(f"    ⚠  {t_val} is already added.")
                else:
                    schedule.append(t_val)
                    print(f"    ✔  Added {t_val}")
            except InvalidTimeError as exc:
                print(f"    ✘  {exc}")

        schedule.sort()   # chronological order

        # ── Notes (optional) ──────────────────────────────────────────────────
        notes = input("  Notes (optional)    : ").strip()

        # ── Build record ──────────────────────────────────────────────────────
        medicine = {
            "id"          : _next_id(data),
            "name"        : name,
            "dosage"      : dosage,
            "stock"       : stock,
            "start_date"  : start_date.isoformat(),
            "end_date"    : end_date.isoformat(),
            "schedule"    : schedule,
            "taken_today" : [],
            "taken_log"   : [],
            "notes"       : notes,
        }
        data["medicines"].append(medicine)
        save_data(data)
        print(f"\n  ✔  '{name}' added successfully (ID: {medicine['id']}).\n")

    except (MediTrackError, ValueError) as exc:
        print(f"\n  ✘  Error: {exc}\n")


# ── 3. Mark dose as taken ─────────────────────────────────────────────────────
def mark_dose_taken(data: dict) -> None:
    """
    Allow the user to mark a specific dose slot as taken.
    Decrements stock by 1 and logs the action.

    Validation:
        - Medicine must exist
        - Time slot must belong to medicine's schedule
        - Dose must not already be marked taken today
        - Stock must be > 0
    """
    print(f"\n{'═'*65}\n  💊  MARK DOSE AS TAKEN\n{'═'*65}")
    try:
        term = input("  Enter medicine name or ID: ").strip()
        med  = _find_medicine(data, term)
        if not med:
            raise MedicineNotFoundError(f"No medicine matching '{term}' found.")

        _reset_taken_today_if_new_day(med)

        print(f"\n  Medicine : {med['name']}")
        print(f"  Schedule : {', '.join(med['schedule'])}")
        print(f"  Taken    : {', '.join(med['taken_today']) or 'none yet'}")
        print(f"  Stock    : {med['stock']} units")

        # Determine which slots are still pending
        now     = datetime.now()
        pending = [s for s in med["schedule"] if s not in med["taken_today"]]
        if not pending:
            print("\n  ✔  All doses for today are already marked as taken!\n")
            return

        # Show pending slots for selection
        print("\n  Pending slots:")
        for idx, slot in enumerate(pending, 1):
            status = _dose_status(med, slot, now)
            print(f"    {idx}. {slot}  [{status.upper()}]")

        choice = input("\n  Enter slot number to mark as taken (or time HH:MM): ").strip()

        # Resolve choice to a time string
        if choice.isdigit():
            cidx = int(choice) - 1
            if 0 <= cidx < len(pending):
                slot_time = pending[cidx]
            else:
                raise ValueError(f"Choice {choice} is out of range.")
        else:
            slot_time = validate_time(choice)
            if slot_time not in med["schedule"]:
                raise ValueError(f"{slot_time} is not a scheduled time for {med['name']}.")
            if slot_time in med["taken_today"]:
                raise ValueError(f"Dose at {slot_time} is already marked as taken.")

        # Stock check
        if med["stock"] <= 0:
            raise InvalidStockError(
                f"Stock for '{med['name']}' is 0! Please refill before marking a dose."
            )

        # Mark taken
        med["taken_today"].append(slot_time)
        med["stock"] -= 1
        med["taken_log"].append({
            "date" : date.today().isoformat(),
            "time" : slot_time,
        })
        save_data(data)

        print(f"\n  ✔  Dose at {slot_time} marked as taken. Stock remaining: {med['stock']}")

        # Post-action low-stock warning
        if med["stock"] <= LOW_STOCK_LIMIT:
            print(f"  ⚠  LOW STOCK WARNING: Only {med['stock']} unit(s) remaining for {med['name']}!")
        print()

    except (MediTrackError, ValueError) as exc:
        print(f"\n  ✘  Error: {exc}\n")


# ── 4. Show alerts ────────────────────────────────────────────────────────────
def show_alerts(data: dict) -> None:
    """
    Scan all active medicines and report:
        - Missed doses (past scheduled time by > MISSED_WINDOW minutes, not taken)
        - Upcoming doses (within the next 2 hours)
        - Low-stock warnings (stock ≤ LOW_STOCK_LIMIT)
    """
    print(f"\n{'═'*65}\n  🔔  ALERTS DASHBOARD\n{'═'*65}")
    now = datetime.now()

    missed_alerts   : list[str] = []
    upcoming_alerts : list[str] = []
    due_alerts      : list[str] = []
    low_stock_alerts: list[str] = []

    for med in data["medicines"]:
        if not _is_active(med):
            continue
        _reset_taken_today_if_new_day(med)

        for slot in med.get("schedule", []):
            status = _dose_status(med, slot, now)
            entry  = f"  {med['name']}  │  {slot}"
            if status == "missed":
                missed_alerts.append(entry)
            elif status == "due":
                due_alerts.append(entry)
            elif status == "upcoming":
                slot_dt = datetime.combine(
                    date.today(), datetime.strptime(slot, TIME_FMT).time()
                )
                mins_away = int((slot_dt - now).total_seconds() / 60)
                if mins_away <= 120:                 # only flag within 2 hours
                    upcoming_alerts.append(f"{entry}  (in {mins_away} min)")

        if med["stock"] <= LOW_STOCK_LIMIT:
            low_stock_alerts.append(
                f"  {med['name']}  │  Only {med['stock']} unit(s) left!"
            )

    save_data(data)

    def _print_section(title: str, items: list[str], icon: str) -> None:
        print(f"\n  {icon}  {title} ({len(items)})")
        print(f"  {'─'*61}")
        if items:
            for item in items:
                print(item)
        else:
            print("  None. All good! ✔")

    _print_section("MISSED DOSES",    missed_alerts,   "✘")
    _print_section("DUE RIGHT NOW",   due_alerts,      "⏰")
    _print_section("UPCOMING (2 hrs)",upcoming_alerts, "🕐")
    _print_section("LOW STOCK",       low_stock_alerts,"⚠")
    print()


# ── 5. Update stock ───────────────────────────────────────────────────────────
def update_stock(data: dict) -> None:
    """
    Refill stock for an existing medicine.

    Validation:
        - Medicine must exist
        - Added quantity must be a positive integer
    """
    print(f"\n{'═'*65}\n  📦  UPDATE STOCK\n{'═'*65}")
    try:
        term = input("  Enter medicine name or ID: ").strip()
        med  = _find_medicine(data, term)
        if not med:
            raise MedicineNotFoundError(f"No medicine matching '{term}' found.")

        print(f"\n  Medicine     : {med['name']}")
        print(f"  Current Stock: {med['stock']} units")

        added = validate_stock(input("  Units to add : "))
        med["stock"] += added
        save_data(data)
        print(f"\n  ✔  Stock updated to {med['stock']} units for '{med['name']}'.\n")

    except (MediTrackError, ValueError) as exc:
        print(f"\n  ✘  Error: {exc}\n")


# ── 6. Search medicine ────────────────────────────────────────────────────────
def search_medicine(data: dict) -> None:
    """
    Search for a medicine by name or ID and display its full card.
    """
    print(f"\n{'═'*65}\n  🔍  SEARCH MEDICINE\n{'═'*65}")
    term = input("  Enter medicine name or ID: ").strip()
    med  = _find_medicine(data, term)
    if med:
        display_medicine_card(med)
        save_data(data)
    else:
        print(f"\n  ✘  No medicine matching '{term}' found.\n")


# ── 7. Delete medicine ────────────────────────────────────────────────────────
def delete_medicine(data: dict) -> None:
    """
    Remove a medicine from the database after confirmation.

    Validation:
        - Medicine must exist
        - User must confirm deletion with 'yes'
    """
    print(f"\n{'═'*65}\n  🗑️   DELETE MEDICINE\n{'═'*65}")
    try:
        term = input("  Enter medicine name or ID: ").strip()
        med  = _find_medicine(data, term)
        if not med:
            raise MedicineNotFoundError(f"No medicine matching '{term}' found.")

        print(f"\n  Found: {med['name']} (ID {med['id']})")
        confirm = input("  Type 'yes' to confirm deletion: ").strip().lower()
        if confirm == "yes":
            data["medicines"] = [m for m in data["medicines"] if m["id"] != med["id"]]
            save_data(data)
            print(f"\n  ✔  '{med['name']}' has been deleted.\n")
        else:
            print("\n  Deletion cancelled.\n")

    except MediTrackError as exc:
        print(f"\n  ✘  Error: {exc}\n")


# ── 8. Dose history ───────────────────────────────────────────────────────────
def view_history(data: dict) -> None:
    """
    Display the complete taken-dose log for a specific medicine.
    """
    print(f"\n{'═'*65}\n  📜  DOSE HISTORY\n{'═'*65}")
    term = input("  Enter medicine name or ID: ").strip()
    med  = _find_medicine(data, term)
    if not med:
        print(f"\n  ✘  No medicine matching '{term}' found.\n")
        return

    log = med.get("taken_log", [])
    print(f"\n  Medicine : {med['name']}")
    print(f"  Total doses recorded: {len(log)}")
    print(f"  {'─'*61}")
    if not log:
        print("  No doses recorded yet.")
    else:
        for entry in log[-30:]:   # show last 30 entries
            print(f"  {entry['date']}  {entry['time']}")
    print()


# ══════════════════════════════════════════════════════════════════════════════
# Application entry point
# ══════════════════════════════════════════════════════════════════════════════
def main() -> None:
    """
    Main application loop.

    Loads data, seeds sample records on first run, then presents the
    interactive menu, dispatching each choice to the appropriate handler.
    Handles unexpected exceptions gracefully so the app never crashes.
    """
    data = load_data()

    # Seed sample data on first run (no medicines in database)
    if not data["medicines"]:
        print("\n  No data found. Loading sample medicines for demonstration…")
        seed_sample_data(data)

    print_header()

    while True:
        try:
            print_menu()
            choice = input("  Enter choice (1–9): ").strip()

            if choice == "1":
                view_all_medicines(data)
            elif choice == "2":
                add_medicine(data)
            elif choice == "3":
                mark_dose_taken(data)
            elif choice == "4":
                show_alerts(data)
            elif choice == "5":
                update_stock(data)
            elif choice == "6":
                search_medicine(data)
            elif choice == "7":
                delete_medicine(data)
            elif choice == "8":
                view_history(data)
            elif choice == "9":
                print("\n  👋  Thank you for using MediTrack. Stay healthy!\n")
                sys.exit(0)
            else:
                print("\n  ⚠  Invalid choice. Please enter a number between 1 and 9.\n")

        except KeyboardInterrupt:
            print("\n\n  Session interrupted. Saving data…")
            save_data(data)
            sys.exit(0)
        except Exception as exc:
            # Catch-all safety net – log the error but keep the app running
            print(f"\n  [UNEXPECTED ERROR] {type(exc).__name__}: {exc}")
            print("  Please report this error. The application will continue.\n")


# ── Script guard ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    main()
