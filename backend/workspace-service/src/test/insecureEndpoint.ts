import express from 'express';

const router = express.Router();

// Hardcoded secret + SQL injection + eval + console.log — all in one function
const API_KEY = 'sk-live-super-secret-key-123';

router.post('/vulnerable', (req, res) => {
  console.log('request received');
  
  // Vulnerability 1: SQL Injection
  const userId = req.body.id;
  const query = `SELECT * FROM users WHERE id = '${userId}'`;
  
  // Vulnerability 2: Dangerous eval
  const result = eval(req.body.expression);
  
  res.json({ query, result, key: API_KEY });
});

export { router as testRouter };
