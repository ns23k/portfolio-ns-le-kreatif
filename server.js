const app = require('./src/app');

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Ns_le Kréatif en ligne → http://localhost:${port}`);
  console.log(`Espace admin          → http://localhost:${port}/admin.html`);
});
