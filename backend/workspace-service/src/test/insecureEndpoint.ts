import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';

const router = express.Router();

// REALLY BAD: Hardcoded secrets including AWS keys
const API_KEY = 'sk-live-super-secret-key-123';
const AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

router.post('/absolutely-terrible-endpoint', (req, res) => {
  console.log('Incoming payload:', req.body);
  debugger; // Left over debug statement in production
  
  // 1. Classic SQL Injection
  const userId = req.body.id;
  const query = `SELECT * FROM users WHERE id = '${userId}' AND status = 'active'`;
  
  // 2. Dangerous Eval
  const mathResult = eval(req.body.expression);
  
  // 3. Command Injection
  const userCommand = req.body.command;
  exec(`ping -c 4 ${userCommand}`, (error, stdout) => {
    if (error) {
      console.error(error); // Logs stack trace directly to console
    }
  });

  // 4. Path Traversal
  const filename = req.query.file as string;
  let fileContent = '';
  if (filename) {
    // Allows reading /etc/passwd or similar
    fileContent = fs.readFileSync(`./public/uploads/${filename}`).toString();
  }

  // 5. Hardcoded CSRF token and exposing internal errors to client
  const csrfToken = 'static-csrf-token-that-never-changes';

  res.send(`
    <html>
      <body>
        <h1>Results</h1>
        <p>Query: ${query}</p>
        <p>Math: ${mathResult}</p>
        <p>File Content: ${fileContent}</p>
        <p>API Key (For debugging only!!!): ${API_KEY}</p>
        <p>AWS Key: ${AWS_ACCESS_KEY_ID}</p>
        <input type="hidden" name="csrf" value="${csrfToken}" />
      </body>
    </html>
  `);
});

export { router as testRouter };
