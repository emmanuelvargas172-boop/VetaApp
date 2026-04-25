const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/mascotas', require('./routes/mascotas'));
app.use('/api/duenos', require('./routes/duenos'));
app.use('/api/historias', require('./routes/historias'));
app.use('/api/citas', require('./routes/citas'));
app.use('/api/recordatorios', require('./routes/recordatorios'));
app.use('/api/inventario', require('./routes/inventario'));

app.listen(PORT, () => {
  console.log(`✅ VetaApp Backend corriendo en http://localhost:${PORT}`);
});
