(function () {
  "use strict";

  var COURSES = ["CSE422", "CSE427", "CSE447", "CSE321"];
  var PRIORITIES = ["High", "Medium", "Low"];
  var PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };
  var HEADERS = ["Task", "Course", "Due", "Minutes", "Priority", "Status"];
  var STORAGE_KEY = "betweenBell.tasks.v1";
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december"];

  // ---------- Dates (stored as YYYY-MM-DD or "") ----------

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function toISO(y, m, d) {
    var date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return y + "-" + pad(m) + "-" + pad(d);
  }

  function addDaysISO(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function monthIndex(name) {
    var n = name.toLowerCase().replace(/\.$/, "");
    for (var i = 0; i < MONTHS.length; i++) {
      if (MONTHS[i] === n || (n.length >= 3 && MONTHS[i].indexOf(n) === 0)) return i + 1;
    }
    return 0;
  }

  // Accepts: "", YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, M/D/YY,
  // "November 25, 2026", "Nov 25, 2026", "25 November 2026",
  // optional trailing time ("3:00 PM", "15:00") and Notion ranges ("A → B").
  function parseDate(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s) return "";
    s = s.split(/\s*(?:→|->)\s*/)[0].trim();
    s = s.replace(/\s*\(.*\)\s*$/, "");
    var m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s].*)?$/))) {
      return toISO(+m[1], +m[2], +m[3]);
    }
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:\s.*)?$/))) {
      var y = +m[3];
      if (m[3].length === 2) y += 2000;
      return toISO(y, +m[1], +m[2]);
    }
    if ((m = s.match(/^(?:[A-Za-z]+,\s*)?([A-Za-z]+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s.*)?$/))) {
      var mi = monthIndex(m[1]);
      return mi ? toISO(+m[3], mi, +m[2]) : null;
    }
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]+\.?),?\s+(\d{4})(?:\s.*)?$/))) {
      var mj = monthIndex(m[2]);
      return mj ? toISO(+m[3], mj, +m[1]) : null;
    }
    return null;
  }

  function formatMDY(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return p[1] + "/" + p[2] + "/" + p[0];
  }

  function formatReadable(iso) {
    if (!iso) return "No due date";
    var p = iso.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  // ---------- Storage ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function demoTasks() {
    return [
      { course: "CSE422", task: "Example: Review lecture notes", minutes: 15, priority: "High", due: addDaysISO(2) },
      { course: "CSE427", task: "Example: Practice problem set", minutes: 30, priority: "Medium", due: addDaysISO(3) },
      { course: "CSE447", task: "Example: Read assigned chapter", minutes: 20, priority: "Low", due: addDaysISO(4) },
      { course: "CSE321", task: "Example: Work on lab assignment", minutes: 45, priority: "High", due: addDaysISO(5) }
    ].map(function (t) {
      t.id = uid();
      t.status = "To do";
      return t;
    });
  }

  function loadTasks() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return demoTasks();
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  var tasks = loadTasks();
  saveTasks();

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      // Storage blocked or full: keep working in memory for this page.
    }
  }

  // ---------- Recommendation ----------

  function compareTasks(a, b) {
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  }

  function recommend(available) {
    var pending = tasks.filter(function (t) { return t.status !== "Done"; });
    var fitting = pending.filter(function (t) { return t.minutes <= available; });
    fitting.sort(compareTasks);
    return { pending: pending, fitting: fitting, best: fitting[0] || null };
  }

  function selectedMinutes() {
    var el = document.querySelector('input[name="minutes"]:checked');
    return el ? +el.value : 30;
  }

  function renderSuggestion() {
    var box = document.getElementById("suggestion");
    var available = selectedMinutes();
    var r = recommend(available);
    box.hidden = false;
    box.innerHTML = "";

    if (!r.best) {
      box.className = "suggestion none";
      var h = el("h3", "Nothing fits right now");
      var p;
      if (r.pending.length === 0) {
        p = el("p", "You have no pending tasks. Add a task or enjoy your break!");
      } else {
        var shortest = Math.min.apply(null, r.pending.map(function (t) { return t.minutes; }));
        p = el("p", "None of your " + r.pending.length + " pending task" + (r.pending.length === 1 ? "" : "s") +
          " fit in " + available + " minutes. The shortest one needs " + shortest +
          " minutes. Try a longer break, or split a task into smaller steps.");
      }
      box.appendChild(h);
      box.appendChild(p);
      return;
    }

    var t = r.best;
    box.className = "suggestion";
    box.appendChild(el("p", "Your next task", "muted small"));
    box.appendChild(el("h3", t.task));
    box.appendChild(el("p", t.course + " · " + t.minutes + " min · " + t.priority + " priority · " + formatReadable(t.due)));

    var reasons = [];
    reasons.push("It takes " + t.minutes + " minutes, which fits in your " + available + "-minute break.");
    var others = r.fitting.length - 1;
    if (others === 0) {
      reasons.push("It is the only pending task that fits in " + available + " minutes.");
    } else if (t.due) {
      var sameDue = r.fitting.filter(function (o) { return o.due === t.due; }).length;
      if (sameDue > 1) {
        reasons.push("It shares the earliest due date (" + formatReadable(t.due) + ") with " + (sameDue - 1) +
          " other task" + (sameDue > 2 ? "s" : "") + ", and has the highest priority (" + t.priority + ") among them.");
      } else {
        reasons.push("It has the earliest due date (" + formatReadable(t.due) + ") of the " + r.fitting.length + " tasks that fit.");
      }
    } else {
      reasons.push("None of the " + r.fitting.length + " fitting tasks have a due date, so the highest priority (" + t.priority + ") was chosen.");
    }
    var excludedLong = r.pending.length - r.fitting.length;
    if (excludedLong > 0) {
      reasons.push(excludedLong + " pending task" + (excludedLong === 1 ? " was" : "s were") + " skipped because " +
        (excludedLong === 1 ? "it needs" : "they need") + " more than " + available + " minutes.");
    }
    var ul = document.createElement("ul");
    reasons.forEach(function (text) { ul.appendChild(el("li", text)); });
    box.appendChild(el("p", "Why this task:", "why"));
    box.appendChild(ul);
  }

  // ---------- Rendering ----------

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function renderCourses() {
    var wrap = document.getElementById("course-cards");
    wrap.innerHTML = "";
    COURSES.forEach(function (code) {
      var mine = tasks.filter(function (t) { return t.course === code; });
      var done = mine.filter(function (t) { return t.status === "Done"; }).length;
      var card = el("article", null, "course-card");
      card.setAttribute("data-course", code);
      card.appendChild(el("h3", code));
      var p1 = el("p");
      p1.appendChild(el("span", String(mine.length - done), "count pending-count"));
      p1.appendChild(document.createTextNode(" pending"));
      var p2 = el("p");
      p2.appendChild(el("span", String(done), "count done-count"));
      p2.appendChild(document.createTextNode(" completed"));
      card.appendChild(p1);
      card.appendChild(p2);
      wrap.appendChild(card);
    });
  }

  function renderTasks() {
    var list = document.getElementById("task-list");
    list.innerHTML = "";
    document.getElementById("empty-tasks").hidden = tasks.length > 0;
    var sorted = tasks.slice().sort(function (a, b) {
      if ((a.status === "Done") !== (b.status === "Done")) return a.status === "Done" ? 1 : -1;
      return compareTasks(a, b);
    });
    sorted.forEach(function (t) {
      var isDone = t.status === "Done";
      var li = el("li", null, "task-item" + (isDone ? " done" : ""));
      li.setAttribute("data-id", t.id);
      var info = el("div");
      info.appendChild(el("div", t.task, "task-name"));
      var meta = el("div", null, "task-meta");
      meta.appendChild(el("span", t.course, "badge"));
      meta.appendChild(document.createTextNode(" " + t.minutes + " min · "));
      meta.appendChild(el("span", t.priority, "prio-" + t.priority));
      meta.appendChild(document.createTextNode(" · Due " + (t.due ? formatReadable(t.due) : "—") + " · "));
      meta.appendChild(el("span", t.status, isDone ? "status-done" : ""));
      info.appendChild(meta);
      var btn = el("button", isDone ? "Reopen" : "Mark done", "btn small " + (isDone ? "secondary" : "primary"));
      btn.type = "button";
      btn.setAttribute("aria-label", (isDone ? "Reopen " : "Mark done ") + t.task);
      btn.addEventListener("click", function () { toggleTask(t.id); });
      li.appendChild(info);
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderAll() {
    renderCourses();
    renderTasks();
    if (!document.getElementById("suggestion").hidden) renderSuggestion();
  }

  function toggleTask(id) {
    tasks.forEach(function (t) {
      if (t.id === id) t.status = t.status === "Done" ? "To do" : "Done";
    });
    saveTasks();
    renderAll();
  }

  // ---------- CSV ----------

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var inQuotes = false;
    text = text.replace(/^\uFEFF/, "");
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else {
          cell += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(cell); cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else {
        cell += c;
      }
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
  }

  function csvCell(value) {
    var s = String(value == null ? "" : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function normalizePriority(v) {
    var s = String(v || "").trim().toLowerCase();
    for (var i = 0; i < PRIORITIES.length; i++) {
      if (PRIORITIES[i].toLowerCase() === s) return PRIORITIES[i];
    }
    return s === "" ? "Medium" : null;
  }

  function normalizeStatus(v) {
    var s = String(v || "").trim().toLowerCase();
    if (s === "done" || s === "complete" || s === "completed") return "Done";
    if (s === "" || s === "to do" || s === "todo" || s === "not started" || s === "in progress") return "To do";
    return null;
  }

  function importCSV(text) {
    var rows = parseCSV(text);
    if (rows.length === 0) throw new Error("The file is empty.");
    var header = rows[0].map(function (h) { return h.trim(); });
    if (header.join(",") !== HEADERS.join(",")) {
      throw new Error("Headers must be exactly: " + HEADERS.join(",") + " (found: " + header.join(",") + ")");
    }
    var imported = [];
    var skipped = [];
    rows.slice(1).forEach(function (r, idx) {
      var line = idx + 2;
      var name = (r[0] || "").trim();
      var course = (r[1] || "").trim().toUpperCase();
      var due = parseDate(r[2]);
      var minutes = Number((r[3] || "").trim());
      var priority = normalizePriority(r[4]);
      var status = normalizeStatus(r[5]);
      var problem = null;
      if (!name) problem = "missing Task";
      else if (COURSES.indexOf(course) === -1) problem = "unknown Course \"" + (r[1] || "") + "\"";
      else if (due === null) problem = "unrecognized Due \"" + r[2] + "\"";
      else if (!Number.isInteger(minutes) || minutes <= 0) problem = "invalid Minutes \"" + (r[3] || "") + "\"";
      else if (!priority) problem = "invalid Priority \"" + r[4] + "\"";
      else if (!status) problem = "invalid Status \"" + r[5] + "\"";
      if (problem) { skipped.push("row " + line + ": " + problem); return; }
      imported.push({ id: uid(), task: name, course: course, due: due, minutes: minutes, priority: priority, status: status });
    });
    return { tasks: imported, skipped: skipped };
  }

  function exportCSV() {
    var lines = [HEADERS.join(",")];
    tasks.forEach(function (t) {
      lines.push([t.task, t.course, formatMDY(t.due), t.minutes, t.priority, t.status].map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }

  function setCsvMessage(text, isError) {
    var m = document.getElementById("csv-message");
    m.textContent = text;
    m.className = "csv-message" + (isError ? " error" : "");
  }

  // ---------- Events ----------

  function init() {
    var courseSelect = document.getElementById("f-course");
    COURSES.forEach(function (c) { courseSelect.appendChild(el("option", c)); });

    document.getElementById("task-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("f-task").value.trim();
      var minutes = Number(document.getElementById("f-minutes").value);
      if (!name || !(minutes > 0)) return;
      tasks.push({
        id: uid(),
        task: name,
        course: courseSelect.value,
        due: document.getElementById("f-due").value || "",
        minutes: Math.round(minutes),
        priority: document.getElementById("f-priority").value,
        status: document.getElementById("f-status").value
      });
      saveTasks();
      e.target.reset();
      renderAll();
    });

    document.getElementById("suggest-btn").addEventListener("click", renderSuggestion);
    document.querySelectorAll('input[name="minutes"]').forEach(function (r) {
      r.addEventListener("change", function () {
        if (!document.getElementById("suggestion").hidden) renderSuggestion();
      });
    });

    document.getElementById("csv-input").addEventListener("change", function (e) {
      var file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var result;
        try {
          result = importCSV(String(reader.result));
        } catch (err) {
          setCsvMessage("Import failed: " + err.message, true);
          return;
        }
        if (result.tasks.length === 0) {
          setCsvMessage("Import failed: no valid rows found." +
            (result.skipped.length ? " Skipped " + result.skipped.join("; ") : ""), true);
          return;
        }
        var ok = window.confirm("Replace your current " + tasks.length + " task(s) with " +
          result.tasks.length + " imported task(s)? This cannot be undone.");
        if (!ok) { setCsvMessage("Import cancelled. Your tasks were not changed.", false); return; }
        tasks = result.tasks;
        saveTasks();
        renderAll();
        setCsvMessage("Imported " + result.tasks.length + " task(s) from " + file.name + "." +
          (result.skipped.length ? " Skipped " + result.skipped.length + ": " + result.skipped.join("; ") : ""), false);
      };
      reader.onerror = function () { setCsvMessage("Import failed: could not read the file.", true); };
      reader.readAsText(file);
    });

    document.getElementById("export-btn").addEventListener("click", function () {
      var blob = new Blob([exportCSV()], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "between-bell-progress.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      setCsvMessage("Exported " + tasks.length + " task(s) to between-bell-progress.csv. This does not update Notion automatically.", false);
    });

    window.addEventListener("storage", function (e) {
      if (e.key !== STORAGE_KEY) return;
      tasks = loadTasks();
      renderAll();
    });

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
