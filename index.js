const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('LINE BOT OK');
});

app.post('/webhook', (req, res) => {
  console.log('Webhook received');
  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
