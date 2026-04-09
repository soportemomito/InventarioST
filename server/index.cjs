'use strict';

const app = require('./app.cjs');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ST API escuchando en http://localhost:${PORT}`);
  console.log('Health: GET /api/health');
});
