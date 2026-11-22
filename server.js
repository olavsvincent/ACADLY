
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./src/database");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from your .env file.");
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function wrap(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Please sign in first." });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: "Your session has expired. Please sign in again."
    });
  }
}

function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "You do not have permission to do that."
      });
    }
    next();
  };
}

function handleError(res, error, message = "Something went wrong.") {
  console.error(error);
  return res.status(500).json({ error: message });
}

// REGISTER
app.post("/api/auth/register", wrap(async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !email || !password) {
    return res.status(400).json({
      error: "Please complete all fields."
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters."
    });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  const passwordHash = await bcrypt.hash(password, 12);

  const { data: user, error } = await db
    .from("users")
    .insert({
      name: name.trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      password_hash: passwordHash
    })
    .select("id, name, username, email, role, xp, streak")
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        error: "That username or email is already registered."
      });
    }
    return handleError(res, error, "Could not create your account.");
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(201).json({ token, user });
}));

// LOGIN
app.post("/api/auth/login", wrap(async (req, res) => {
  const identifier = String(req.body.identifier || "")
    .trim()
    .toLowerCase();

  const password = req.body.password || "";

  const { data: users, error } = await db
    .from("users")
    .select("*")
    .or(`email.eq.${identifier},username.eq.${identifier}`)
    .limit(1);

  if (error) return handleError(res, error);

  const user = users?.[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({
      error: "Incorrect username/email or password."
    });
  }

  await db.from("login_history").insert({
    user_id: user.id,
    ip_address: req.ip
  });

  const safeUser = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    xp: user.xp,
    streak: user.streak
  };

  const token = jwt.sign(
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, user: safeUser });
}));

// CURRENT USER
app.get("/api/me", auth, wrap(async (req, res) => {
  const { data, error } = await db
    .from("users")
    .select("id, name, username, email, role, xp, streak, created_at")
    .eq("id", req.user.id)
    .maybeSingle();

  if (error) return handleError(res, error);
  if (!data) return res.status(404).json({ error: "Account not found." });

  res.json(data);
}));

// UPDATE PROFILE
app.patch("/api/me", auth, wrap(async (req, res) => {
  const { name, bio } = req.body;
  const updates = {};

  if (name !== undefined) updates.name = name.trim();
  if (bio !== undefined) updates.bio = bio;

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  const { data, error } = await db
    .from("users")
    .update(updates)
    .eq("id", req.user.id)
    .select("id, name, username, email, role, xp, streak, bio")
    .single();

  if (error) return handleError(res, error);
  res.json(data);
}));

// DASHBOARD
app.get("/api/dashboard", auth, wrap(async (req, res) => {
  const userId = req.user.id;

  const [
    tasksResult,
    completedResult,
    pendingResult,
    quizResult,
    subjectsResult,
    progressResult,
    recentResult
  ] = await Promise.all([
    db.from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),

    db.from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("completed", true),

    db.from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("completed", false),

    db.from("quiz_attempts")
      .select("score")
      .eq("user_id", userId),

    db.from("subjects")
      .select("*")
      .order("name"),

    db.from("subject_progress")
      .select("subject_id, progress")
      .eq("user_id", userId),

    db.from("activity_log")
      .select("activity, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  const results = [
    tasksResult,
    completedResult,
    pendingResult,
    quizResult,
    subjectsResult,
    progressResult,
    recentResult
  ];

  const failed = results.find(result => result.error);
  if (failed) return handleError(res, failed.error);

  const scores = quizResult.data || [];
  const quizAverage = scores.length
    ? Math.round(
        scores.reduce((sum, item) => sum + Number(item.score), 0) /
        scores.length * 10
      ) / 10
    : 0;

  const progressMap = new Map(
    (progressResult.data || []).map(item => [
      item.subject_id,
      item.progress
    ])
  );

  const subjects = (subjectsResult.data || []).map(subject => ({
    ...subject,
    progress: progressMap.get(subject.id) ?? 0
  }));

  res.json({
    tasks: tasksResult.data || [],
    completed: completedResult.count || 0,
    pending: pendingResult.count || 0,
    quizAverage,
    quizAttempts: scores.length,
    subjects,
    recent: recentResult.data || []
  });
}));

// SUBJECTS
app.get("/api/subjects", auth, wrap(async (req, res) => {
  const [subjectsResult, progressResult] = await Promise.all([
    db.from("subjects").select("*").order("name"),
    db.from("subject_progress")
      .select("subject_id, progress")
      .eq("user_id", req.user.id)
  ]);

  if (subjectsResult.error) return handleError(res, subjectsResult.error);
  if (progressResult.error) return handleError(res, progressResult.error);

  const progressMap = new Map(
    (progressResult.data || []).map(item => [
      item.subject_id,
      item.progress
    ])
  );

  res.json((subjectsResult.data || []).map(subject => ({
    ...subject,
    progress: progressMap.get(subject.id) ?? 0
  })));
}));

app.post("/api/subjects/:id/progress", auth, wrap(async (req, res) => {
  const progress = Math.max(
    0,
    Math.min(100, Number(req.body.progress))
  );

  if (!Number.isFinite(progress)) {
    return res.status(400).json({ error: "Invalid progress value." });
  }

  const { error } = await db
    .from("subject_progress")
    .upsert({
      user_id: req.user.id,
      subject_id: req.params.id,
      progress
    }, {
      onConflict: "user_id,subject_id"
    });

  if (error) return handleError(res, error);

  res.json({ success: true, progress });
}));

// TASKS
app.get("/api/tasks", auth, wrap(async (req, res) => {
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("user_id", req.user.id)
    .order("completed", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) return handleError(res, error);
  res.json(data);
}));

app.post("/api/tasks", auth, wrap(async (req, res) => {
  const { title, subject, due_date, priority } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({
      error: "Task title is required."
    });
  }

  const { data: task, error } = await db
    .from("tasks")
    .insert({
      user_id: req.user.id,
      title: title.trim(),
      subject: subject || "General",
      due_date: due_date || null,
      priority: priority || "Normal"
    })
    .select("*")
    .single();

  if (error) return handleError(res, error);

  await db.from("activity_log").insert({
    user_id: req.user.id,
    activity: `Added task: ${title.trim()}`
  });

  res.status(201).json(task);
}));

app.patch("/api/tasks/:id", auth, wrap(async (req, res) => {
  const { data: task, error: findError } = await db
    .from("tasks")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (findError) return handleError(res, findError);
  if (!task) return res.status(404).json({ error: "Task not found." });

  const completed = req.body.completed === undefined
    ? task.completed
    : Boolean(req.body.completed);

  const { data: updated, error } = await db
    .from("tasks")
    .update({ completed })
    .eq("id", task.id)
    .eq("user_id", req.user.id)
    .select("*")
    .single();

  if (error) return handleError(res, error);

  if (completed && !task.completed) {
    const { data: user, error: userError } = await db
      .from("users")
      .select("xp")
      .eq("id", req.user.id)
      .single();

    if (userError) return handleError(res, userError);

    await db.from("users")
      .update({ xp: user.xp + 10 })
      .eq("id", req.user.id);

    await db.from("activity_log").insert({
      user_id: req.user.id,
      activity: `Completed task: ${task.title}`
    });
  }

  res.json(updated);
}));

app.delete("/api/tasks/:id", auth, wrap(async (req, res) => {
  const { data, error } = await db
    .from("tasks")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .select("id");

  if (error) return handleError(res, error);
  if (!data.length) return res.status(404).json({ error: "Task not found." });

  res.json({ success: true });
}));

// QUIZZES
app.get("/api/quizzes", auth, wrap(async (req, res) => {
  const { data, error } = await db
    .from("quizzes")
    .select("id, title, subject, description, question_count")
    .order("id");

  if (error) return handleError(res, error);
  res.json(data);
}));

app.get("/api/quizzes/:id", auth, wrap(async (req, res) => {
  const { data: quiz, error } = await db
    .from("quizzes")
    .select("id, title, subject, description")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) return handleError(res, error);
  if (!quiz) return res.status(404).json({ error: "Quiz not found." });

  const { data: questions, error: questionError } = await db
    .from("questions")
    .select("id, prompt, options, question_type")
    .eq("quiz_id", quiz.id)
    .order("id");

  if (questionError) return handleError(res, questionError);

  res.json({ ...quiz, questions });
}));

app.post("/api/quizzes/:id/submit", auth, wrap(async (req, res) => {
  const { data: questions, error } = await db
    .from("questions")
    .select("id, answer")
    .eq("quiz_id", req.params.id);

  if (error) return handleError(res, error);
  if (!questions.length) {
    return res.status(404).json({ error: "Quiz not found." });
  }

  const answers = req.body.answers || {};
  let correct = 0;

  questions.forEach(question => {
    if (
      String(answers[question.id] ?? "").trim().toLowerCase() ===
      question.answer.toLowerCase()
    ) {
      correct++;
    }
  });

  const score = Math.round(correct / questions.length * 100);
  const xpEarned = correct * 5;

  const { error: attemptError } = await db
    .from("quiz_attempts")
    .insert({
      user_id: req.user.id,
      quiz_id: req.params.id,
      score,
      correct,
      total: questions.length
    });

  if (attemptError) return handleError(res, attemptError);

  const { data: user, error: userError } = await db
    .from("users")
    .select("xp")
    .eq("id", req.user.id)
    .single();

  if (userError) return handleError(res, userError);

  await db.from("users")
    .update({ xp: user.xp + xpEarned })
    .eq("id", req.user.id);

  const { data: quiz } = await db
    .from("quizzes")
    .select("title")
    .eq("id", req.params.id)
    .single();

  await db.from("activity_log").insert({
    user_id: req.user.id,
    activity: `Completed ${quiz.title} (${score}%)`
  });

  res.json({
    score,
    correct,
    total: questions.length,
    xpEarned
  });
}));

// ANALYTICS
app.get("/api/analytics", auth, wrap(async (req, res) => {
  const [attemptsResult, userResult] = await Promise.all([
    db.from("quiz_attempts")
      .select("score, created_at, quiz:quizzes(title)")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(10),

    db.from("users")
      .select("xp, streak")
      .eq("id", req.user.id)
      .single()
  ]);

  if (attemptsResult.error) return handleError(res, attemptsResult.error);
  if (userResult.error) return handleError(res, userResult.error);

  const attempts = (attemptsResult.data || []).map(item => ({
    title: item.quiz?.title || "Quiz",
    score: item.score,
    created_at: item.created_at
  }));

  res.json({
    attempts,
    xp: userResult.data.xp,
    streak: userResult.data.streak
  });
}));

// ADMIN OVERVIEW
app.get("/api/admin/overview", auth, role("admin"), wrap(async (req, res) => {
  const [
    students,
    teachers,
    subjects,
    quizAttempts
  ] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "teacher"),
    db.from("subjects").select("id", { count: "exact", head: true }),
    db.from("quiz_attempts").select("id", { count: "exact", head: true })
  ]);

  const failed = [students, teachers, subjects, quizAttempts]
    .find(result => result.error);

  if (failed) return handleError(res, failed.error);

  res.json({
    students: students.count || 0,
    teachers: teachers.count || 0,
    subjects: subjects.count || 0,
    quizAttempts: quizAttempts.count || 0
  });
}));

// FRONTEND
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ERROR HANDLER
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(PORT, () => {
  console.log(`Acadly is running at http://localhost:${PORT}`);
});
