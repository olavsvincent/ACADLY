
# Acadly

A full-stack Student Learning and Academic Management Platform built with HTML, CSS, JavaScript, Node.js, Express, and Supabase.

## Technologies

- HTML, CSS, JavaScript
- Node.js and Express
- Supabase PostgreSQL
- JWT authentication
- bcrypt password hashing

## Requirements

- Node.js
- npm
- A Supabase project

## Run Locally

1. Open the Acadly project folder in VS Code.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root.

4. Add your Supabase credentials:

   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SECRET_KEY=your_supabase_secret_key
   JWT_SECRET=your_long_random_secret
   ```

5. Make sure your Supabase database tables have been created.

6. Start the server:

   ```bash
   npm start
   ```

7. Open `http://localhost:3000` in your browser.

## Current Modules

- Account registration and login
- Password hashing
- JWT authentication
- Student dashboard
- Subject management and progress tracking
- Task planner
- Multiple-choice quizzes
- Automatic quiz scoring
- XP rewards
- Student profile management
- Analytics
- Admin overview API

## Important Security Notes

- Never upload your `.env` file.
- Never expose your Supabase secret key in frontend JavaScript.
- Use a strong JWT secret.
- Enable appropriate database security before production deployment.

## Project Status

Acadly is currently under development.
