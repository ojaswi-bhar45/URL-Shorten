const express = require("express");
const app = express();

let port = 3000;

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

app.get("/health", (req, res) => {
  res.send("Ok");
});
