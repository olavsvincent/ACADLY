const API = "/api";
let token = localStorage.getItem("acadly_token");
let currentUser = null;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const headers = () => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });

async function request(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function message(id, text) { $(id).textContent = text; }
function toast(text) { const el = $("#toast"); el.textContent = text; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2500); }
function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function showAuth() { $("#authView").classList.remove("hidden"); $("#appView").classList.add("hidden"); }
function showApp() { $("#authView").classList.add("hidden"); $("#appView").classList.remove("hidden"); }
function initials(name) { return (name || "S").trim().split(/\s+/).map(x => x[0]).slice(0,2).join("").toUpperCase(); }

$$(".auth-tab").forEach(btn => btn.addEventListener("click", () => {
  $$(".auth-tab").forEach(x => x.classList.toggle("active", x === btn));
  $("#loginForm").classList.toggle("hidden", btn.dataset.auth !== "login");
  $("#registerForm").classList.toggle("hidden", btn.dataset.auth !== "register");
}));
$$(".show-pass").forEach(btn => btn.addEventListener("click", () => {
  const input = btn.parentElement.querySelector("input");
  input.type = input.type === "password" ? "text" : "password";
  btn.innerHTML = `<i class="fa-regular ${input.type === "password" ? "fa-eye" : "fa-eye-slash"}"></i>`;
}));
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); message("#loginMessage", "");
  const form = Object.fromEntries(new FormData(e.currentTarget));
  try { const data = await request("/auth/login", { method:"POST", body:JSON.stringify(form) }); saveSession(data); }
  catch (err) { message("#loginMessage", err.message); }
});
$("#registerForm").addEventListener("submit", async e => {
  e.preventDefault(); message("#registerMessage", "");
  const form = Object.fromEntries(new FormData(e.currentTarget));
  try { const data = await request("/auth/register", { method:"POST", body:JSON.stringify(form) }); saveSession(data); }
  catch (err) { message("#registerMessage", err.message); }
});
function saveSession(data) { token = data.token; currentUser = data.user; localStorage.setItem("acadly_token", token); boot(); }
$("#logoutBtn").addEventListener("click", () => { token = null; currentUser = null; localStorage.removeItem("acadly_token"); showAuth(); });

function navigate(page) {
  $$(".page").forEach(el => el.classList.toggle("active", el.id === `${page}Page`));
  $$(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  const label = ({dashboard:"Overview",subjects:"My subjects",planner:"Study planner",quizzes:"Quizzes",analytics:"My progress",profile:"My profile"})[page] || "Overview";
  $("#pageCrumb").textContent = label;
  $("#sidebar").classList.remove("open");
  if (page === "subjects") loadSubjects();
  if (page === "planner") loadTasks();
  if (page === "quizzes") loadQuizzes();
  if (page === "analytics") loadAnalytics();
  if (page === "profile") loadProfile();
}
$$(".nav-link").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.page)));
$$("[data-go]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.go)));
$("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

async function boot() {
  if (!token) return showAuth();
  try {
    currentUser = await request("/me");
    showApp();
    $("#todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
    $("#fullDate").textContent = new Date().toLocaleDateString(undefined, { month:"long", day:"numeric", year:"numeric" });
    $("#topAvatar").textContent = initials(currentUser.name);
    $("#welcomeTitle").textContent = `Good to see you, ${currentUser.name.split(" ")[0]}.`;
    await loadDashboard();
  } catch { token = null; localStorage.removeItem("acadly_token"); showAuth(); }
}
async function loadDashboard() {
  const data = await request("/dashboard");
  $("#xpStat").textContent = data.user?.xp ?? currentUser.xp ?? 0;
  $("#completedStat").textContent = data.completed;
  $("#pendingStat").textContent = data.pending;
  $("#averageStat").innerHTML = `${data.quizAverage}<small>%</small>`;
  $("#attemptStat").textContent = `${data.quizAttempts} quiz attempts`;
  $("#subjectPreview").innerHTML = data.subjects.length ? data.subjects.slice(0,4).map(subjectRow).join("") : empty("No subjects yet.");
  $("#taskPreview").innerHTML = data.tasks.length ? data.tasks.map(taskRow).join("") : empty("No tasks yet. Add one to get started.");
  $("#activityList").innerHTML = data.recent.length ? data.recent.map(a => `<div class="activity-item"><span class="activity-dot"></span><span>${escapeHtml(a.activity)}</span><time>${new Date(a.created_at + "Z").toLocaleDateString()}</time></div>`).join("") : empty("Your recent activity will appear here.");
  bindTaskChecks();
}
function empty(text) { return `<div class="empty-state" style="color:#a0a2b0;font-size:12px;padding:12px 0">${text}</div>`; }
function subjectRow(s) { return `<div class="subject-row"><div class="subject-symbol"><i class="fa-solid fa-book-open"></i></div><div><strong>${escapeHtml(s.name)}</strong><div class="progress-track"><div class="progress-fill" style="width:${s.progress}%"></div></div></div><span class="progress-value">${s.progress}%</span></div>`; }
function taskRow(t) { return `<div class="task-row ${t.completed ? "done" : ""}"><button class="task-check ${t.completed ? "done" : ""}" data-task="${t.id}" data-completed="${t.completed}">${t.completed ? '<i class="fa-solid fa-check"></i>' : ""}</button><div><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.subject || "General")}</small></div><div class="task-meta"><small>${t.due_date ? new Date(t.due_date + "T00:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "No due date"}</small></div></div>`; }
function bindTaskChecks() { $$("[data-task]").forEach(btn => btn.addEventListener("click", async () => { try { await request(`/tasks/${btn.dataset.task}`, { method:"PATCH", body:JSON.stringify({completed:btn.dataset.completed !== "1"}) }); await loadDashboard(); if ($("#plannerPage").classList.contains("active")) loadTasks(); } catch(e) { toast(e.message); } })); }
async function loadSubjects() {
  const subjects = await request("/subjects");
  $("#allSubjects").innerHTML = subjects.map(s => `<article class="subject-card"><div class="subject-symbol"><i class="fa-solid fa-book-open"></i></div><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.description)}</p><div class="progress-track"><div class="progress-fill" style="width:${s.progress}%"></div></div><div style="display:flex;justify-content:space-between;align-items:center"><small style="color:#999">${s.progress}% complete</small><button class="text-btn update-progress" data-id="${s.id}" data-progress="${s.progress}">Update progress</button></div></article>`).join("");
  $$(".update-progress").forEach(btn => btn.addEventListener("click", async () => { const value = prompt("Enter your progress from 0 to 100:", btn.dataset.progress); if (value === null || value.trim() === "" || !Number.isFinite(Number(value))) return; try { await request(`/subjects/${btn.dataset.id}/progress`, { method:"POST", body:JSON.stringify({progress:Number(value)}) }); loadSubjects(); loadDashboard(); } catch(e) { toast(e.message); } }));
}
async function loadTasks() {
  const tasks = await request("/tasks");
  $("#allTasks").innerHTML = tasks.length ? tasks.map(taskRow).join("") : empty("Nothing on your list. Enjoy the breathing room.");
  bindTaskChecks();
  $$("[data-task]").forEach(btn => btn.addEventListener("contextmenu", async e => { e.preventDefault(); if(confirm("Delete this task?")) { await request(`/tasks/${btn.dataset.task}`, {method:"DELETE"}); loadTasks(); loadDashboard(); } }));
}
$("#taskForm").addEventListener("submit", async e => {
  e.preventDefault(); const form = Object.fromEntries(new FormData(e.currentTarget));
  try { await request("/tasks", {method:"POST",body:JSON.stringify(form)}); e.currentTarget.reset(); message("#taskMessage","Task added."); loadTasks(); loadDashboard(); }
  catch(err) { message("#taskMessage",err.message); }
});
async function loadQuizzes() {
  const quizzes = await request("/quizzes");
  $("#quizGrid").innerHTML = quizzes.map(q => `<article class="quiz-card"><div class="quiz-icon"><i class="fa-solid fa-clipboard-question"></i></div><span class="eyebrow">${escapeHtml(q.subject)}</span><h3>${escapeHtml(q.title)}</h3><p>${escapeHtml(q.description)}</p><small style="color:#999">${q.question_count} questions</small><br><button class="primary-btn start-quiz" data-id="${q.id}">Start quiz <i class="fa-solid fa-arrow-right"></i></button></article>`).join("");
  $$(".start-quiz").forEach(btn => btn.addEventListener("click", () => startQuiz(btn.dataset.id)));
}
async function startQuiz(id) {
  const quiz = await request(`/quizzes/${id}`);
  $("#quizStage").classList.remove("hidden");
  $("#quizStage").innerHTML = `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(quiz.subject)}</span><h2>${escapeHtml(quiz.title)}</h2><p>${quiz.questions.length} questions · Take your time</p></div></div><form id="quizForm">${quiz.questions.map((q,i) => `<div class="question-block"><h3>${i+1}. ${escapeHtml(q.prompt)}</h3>${q.options.map(option => `<label class="answer-option"><input type="radio" name="q${q.id}" value="${escapeHtml(option)}" required> ${escapeHtml(option)}</label>`).join("")}</div>`).join("")}<button class="primary-btn" type="submit">Submit answers <i class="fa-solid fa-check"></i></button></form><div id="quizResult" class="form-message"></div>`;
  $("#quizForm").addEventListener("submit", async e => {
    e.preventDefault(); const answers = {};
    quiz.questions.forEach(q => { answers[q.id] = new FormData(e.currentTarget).get(`q${q.id}`); });
    const result = await request(`/quizzes/${id}/submit`, {method:"POST",body:JSON.stringify({answers})});
    $("#quizResult").innerHTML = `<strong style="color:var(--green);font-size:17px">You scored ${result.score}%</strong><br>${result.correct} out of ${result.total} correct · +${result.xpEarned} XP`;
    $("#quizForm").querySelectorAll("input,button").forEach(el => el.disabled = true);
    loadDashboard();
  });
  $("#quizStage").scrollIntoView({behavior:"smooth",block:"start"});
}
async function loadAnalytics() {
  const data = await request("/analytics");
  $("#attemptList").innerHTML = data.attempts.length ? data.attempts.map(a => `<div class="attempt-row"><span>${escapeHtml(a.title)}<small style="display:block;color:#aaa;margin-top:4px">${new Date(a.created_at + "Z").toLocaleString()}</small></span><span class="score-pill">${a.score}%</span></div>`).join("") : empty("Complete a quiz and your results will show up here.");
}
async function loadProfile() {
  const user = await request("/me");
  $("#profileAvatar").textContent = initials(user.name); $("#profileName").textContent = user.name; $("#profileEmail").textContent = user.email; $("#profileRole").textContent = user.role.toUpperCase();
  $("#profileForm").elements.name.value = user.name; $("#profileForm").elements.bio.value = user.bio || "";
}
$("#profileForm").addEventListener("submit", async e => {
  e.preventDefault(); const form = Object.fromEntries(new FormData(e.currentTarget));
  try { const user = await request("/me",{method:"PATCH",body:JSON.stringify(form)}); currentUser = user; message("#profileMessage","Your profile has been updated."); $("#welcomeTitle").textContent = `Good to see you, ${user.name.split(" ")[0]}.`; $("#topAvatar").textContent = initials(user.name); $("#profileName").textContent = user.name; $("#profileAvatar").textContent = initials(user.name); }
  catch(err) { message("#profileMessage",err.message); }
});
boot();
