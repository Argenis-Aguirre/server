const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const app = express();
//const port = 3306;

// Configura la conexión a la base de datos
const db = mysql.createConnection({
  host: '18.117.126.89',
  user: 'admin',
  password: 'Admin10$',
  database: 'Base_datos_Plantas'
});


// Conectar a la base de datos
db.connect((err) => {
  if (err) {
    console.error('Error de conexión a la base de datos:', err);
  } else {
    console.log('Conectado a la base de datos');
  }
});

// Configura CORS para permitir peticiones desde el frontend en localhost:3000
app.use(cors({ origin: 'http://localhost:3000' }));

// Middleware para analizar el cuerpo de la solicitud en JSON
app.use(express.json());

// Configura el transporte de Nodemailer para enviar correos
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'elrinconverdeoficial@gmail.com',
    pass: 'fbql aacq ywwj zhcd', // La contraseña de tu correo
  },
});

// Ruta para registrar usuarios
app.post('/api/register', async (req, res) => {
  const { nombre, apellido, email, telefono, password } = req.body;

  try {
    const [results] = await db.promise().query('SELECT * FROM usuarios WHERE email = ?', [email]);

    if (results.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.promise().query(
      'INSERT INTO usuarios (nombre, apellido, email, telefono, password, fecha_creacion) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, apellido, email, telefono, hashedPassword, new Date()]
    );

    const mailOptions = {
      from: 'elrinconverdeoficial@gmail.com',
      to: email,
      subject: 'Bienvenido a nuestra tienda de plantas',
      text: `Hola ${nombre},\n\nGracias por registrarte en nuestra tienda de plantas. Estamos felices de tenerte como parte de nuestra comunidad.\n\nSaludos,\nEl equipo de El Rincón Verde`,
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ error: 'Error al enviar el correo de bienvenida' });
      }
      console.log('Correo enviado: ' + info.response);
    });

    res.status(201).json({ message: 'Usuario registrado exitosamente y correo enviado' });
  } catch (err) {
    console.error('Error en el registro:', err);
    res.status(500).json({ error: 'Error al registrar el usuario' });
  }
});

// Ruta de inicio de sesión
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [results] = await db.promise().query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (results.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const user = results[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, 'tu_clave_secreta', { expiresIn: '5h' }); // Expira en 1 hora


    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        telefono: user.telefono,
        fecha_creacion: user.fecha_creacion
      }
    });
  } catch (err) {
    console.error('Error en el inicio de sesión:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Ruta para obtener todas las plantas o filtrar por categoría
app.get('/api/plants', async (req, res) => {
  const { category } = req.query; // Extraer el parámetro de consulta 'category'

  try {
    let query = 'SELECT * FROM plants';
    let queryParams = [];

    // Agregar filtro de categoría si se proporciona
    if (category) {
      query += ' WHERE category = ?';
      queryParams.push(category);
    }

    const [rows] = await db.promise().query(query, queryParams);
    res.json(rows); // Devolver el resultado filtrado en formato JSON
  } catch (err) {
    console.error('Error al obtener las plantas:', err);
    res.status(500).json({ error: 'Error al obtener las plantas' });
  }
});

// Ruta para obtener los detalles de una planta por ID
app.get('/api/plants/:id', async (req, res) => {
  const { id } = req.params;  // Obtener el id de la planta de los parámetros de la URL

  try {
    const [rows] = await db.promise().query('SELECT * FROM plants WHERE id = ?', [id]);

    // Verificar si se encontró la planta
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Planta no encontrada' });
    }

    res.json(rows[0]);  // Devolver la planta encontrada
  } catch (err) {
    console.error('Error al obtener la planta:', err);
    res.status(500).json({ error: 'Error al obtener la planta' });
  }
});

app.delete('/api/delete-account', async (req, res) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(401).json({ error: 'No se proporcionó un token de autenticación' });
  }

  try {
    const decoded = jwt.verify(token, 'tu_clave_secreta');
    const userId = decoded.id;

    // Consultar el usuario para obtener su información
    const [userResults] = await db.promise().query('SELECT * FROM usuarios WHERE id = ?', [userId]);

    if (userResults.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userResults[0];
    const email = user.email;

    // Eliminar los detalles del pedido relacionados con los pedidos del usuario
    await db.promise().query('DELETE FROM detalles_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE usuario_id = ?)', [userId]);

    // Eliminar los pedidos del usuario
    await db.promise().query('DELETE FROM pedidos WHERE usuario_id = ?', [userId]);

    // Ahora eliminar el usuario
    const [results] = await db.promise().query('DELETE FROM usuarios WHERE id = ?', [userId]);

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Enviar un correo de despedida y agradecimiento
    const mailOptions = {
      from: 'elrinconverdeoficial@gmail.com',
      to: email,
      subject: 'Gracias por ser parte de El Rincón Verde',
      text: `Hola ${user.nombre},\n\nLamentamos que hayas decidido eliminar tu cuenta. Queremos agradecerte por haberte sido parte de nuestra comunidad de El Rincón Verde. Si alguna vez deseas regresar, estaremos aquí para ayudarte.\n\nTe deseamos lo mejor y gracias por tu preferencia.\n\nSaludos,\nEl equipo de El Rincón Verde`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ error: 'Error al enviar el correo de despedida' });
      }
      console.log('Correo de despedida enviado: ' + info.response);
    });

    // Responder que la cuenta ha sido eliminada correctamente
    res.json({ message: 'Cuenta eliminada correctamente y correo de despedida enviado' });

  } catch (err) {
    console.error('Error al eliminar la cuenta:', err);
    res.status(500).json({ error: 'Error al eliminar la cuenta' });
  }
});

// Ruta para crear una nueva dirección o actualizar la existente
app.post('/api/save-address', async (req, res) => {
  const token = req.headers['authorization'];  // Obtener el token del encabezado

  // Depurar token
  console.log("Token recibido:", token);

  if (!token) {
    return res.status(401).json({ error: 'No se proporcionó un token de autenticación' });
  }

  try {
    // Verificar y decodificar el token (asegúrate de que 'tu_clave_secreta' sea la correcta)
    const decoded = jwt.verify(token.split(" ")[1], 'tu_clave_secreta');  // Usa token.split para quitar "Bearer"
    const userId = decoded.id;

    // Datos de la dirección
    const { calle, numero, ciudad, estado, codigo_postal, tipo_direccion } = req.body;

    if (!calle || !numero || !ciudad || !estado || !codigo_postal || !tipo_direccion) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    // Verificar si ya existe una dirección para el usuario
    const [existingAddress] = await db.promise().query(
      'SELECT * FROM direcciones WHERE usuario_id = ?',
      [userId]
    );

    if (existingAddress.length > 0) {
      const [updateResults] = await db.promise().query(
        'UPDATE direcciones SET calle = ?, numero = ?, ciudad = ?, estado = ?, codigo_postal = ?, tipo_direccion = ? WHERE usuario_id = ?',
        [calle, numero, ciudad, estado, codigo_postal, tipo_direccion, userId]
      );

      if (updateResults.affectedRows === 0) {
        return res.status(404).json({ error: 'No se pudo actualizar la dirección' });
      }
      res.json({ message: 'Dirección actualizada correctamente' });
    } else {
      const [insertResults] = await db.promise().query(
        'INSERT INTO direcciones (usuario_id, calle, numero, ciudad, estado, codigo_postal, tipo_direccion) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, calle, numero, ciudad, estado, codigo_postal, tipo_direccion]
      );

      if (insertResults.affectedRows === 0) {
        return res.status(500).json({ error: 'No se pudo guardar la dirección' });
      }
      res.json({ message: 'Dirección guardada correctamente' });
    }

  } catch (err) {
    console.error('Error al guardar o actualizar la dirección:', err);
    res.status(500).json({ error: 'Hubo un problema al guardar la dirección' });
  }
});


// Ruta para obtener la dirección del usuario
app.get('/api/get-address', async (req, res) => {
  const token = req.headers['authorization'];  // Obtener el token del encabezado

  if (!token) {
    return res.status(401).json({ error: 'No se proporcionó un token de autenticación' });
  }

  try {
    // Verificar y decodificar el token
    const decoded = jwt.verify(token.split(" ")[1], 'tu_clave_secreta');  // Usa token.split para quitar "Bearer"
    const userId = decoded.id;

    // Consultar la dirección del usuario
    const [rows] = await db.promise().query('SELECT * FROM direcciones WHERE usuario_id = ?', [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Dirección no encontrada' });
    }

    res.json(rows[0]);  // Devolver la dirección encontrada
  } catch (err) {
    console.error('Error al obtener la dirección:', err);
    res.status(500).json({ error: 'Error al obtener la dirección' });
  }
});



// Ruta para eliminar una dirección
app.delete('/api/delete-address', async (req, res) => {
  const token = req.headers['authorization'];  // Obtener el token del encabezado

  if (!token) {
    return res.status(401).json({ error: 'No se proporcionó un token de autenticación' });
  }

  try {
    // Verificar y decodificar el token
    const decoded = jwt.verify(token.split(" ")[1], 'tu_clave_secreta');  // Usa token.split para quitar "Bearer"
    const userId = decoded.id;

    // Consultar si existe una dirección para el usuario
    const [addressResults] = await db.promise().query('SELECT * FROM direcciones WHERE usuario_id = ?', [userId]);

    if (addressResults.length === 0) {
      return res.status(404).json({ error: 'Dirección no encontrada' });
    }

    // Eliminar la dirección del usuario
    const [deleteResults] = await db.promise().query('DELETE FROM direcciones WHERE usuario_id = ?', [userId]);

    if (deleteResults.affectedRows === 0) {
      return res.status(404).json({ error: 'No se pudo eliminar la dirección' });
    }

    // Responder que la dirección ha sido eliminada correctamente
    res.json({ message: 'Dirección eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar la dirección:', err);
    res.status(500).json({ error: 'Error al eliminar la dirección' });
  }
});


app.post('/api/pagar', (req, res) => {
  const { usuario_id, total, costo_envio, total_con_iva, productos } = req.body;

  // Insertar el pedido en la tabla 'pedidos'
  const query = `INSERT INTO pedidos (usuario_id, total, costo_envio, total_con_iva) VALUES (?, ?, ?, ?)`;
  db.query(query, [usuario_id, total, costo_envio, total_con_iva], (err, result) => {
    if (err) {
      console.error('Error al insertar el pedido:', err);
      return res.status(500).send('Error al procesar el pago');
    }

    const pedidoId = result.insertId;

    // Insertar los detalles del pedido en la tabla 'detalles_pedido'
    productos.forEach((producto) => {
      const detalleQuery = `INSERT INTO detalles_pedido (pedido_id, plants_id, cantidad, precio) VALUES (?, ?, ?, ?)`;
      db.query(detalleQuery, [pedidoId, producto.id, producto.quantity, producto.price], (err) => {
        if (err) {
          console.error('Error al insertar el detalle del pedido:', err);
        }
      });

      // Restar la cantidad del producto en la tabla 'productos'
      const updateQuery = `UPDATE plants SET quantity = quantity - ? WHERE id = ?`;
      db.query(updateQuery, [producto.quantity, producto.id], (err) => {
        if (err) {
          console.error('Error al actualizar el inventario:', err);
        }
      });
    });

    // Recuperar los detalles de los productos comprados para el correo
    const productIds = productos.map(producto => producto.id);
    const getProductDetailsQuery = `SELECT * FROM plants WHERE id IN (?)`;
    db.query(getProductDetailsQuery, [productIds], (err, productDetails) => {
      if (err) {
        console.error('Error al recuperar los detalles de los productos:', err);
        return res.status(500).send('Error al procesar el pedido');
      }

      // Preparar el texto del correo con los detalles de los productos
      let productsText = '';
      productDetails.forEach(product => {
        const productInOrder = productos.find(item => item.id === product.id);
        productsText += `<p>${product.name} - $${product.price} x ${productInOrder.quantity}</p>`;
      });

      // Obtener el correo del usuario (suponiendo que tienes el email en la base de datos)
      const userQuery = `SELECT email, nombre FROM usuarios WHERE id = ?`;
      db.query(userQuery, [usuario_id], (err, userResult) => {
        if (err) {
          console.error('Error al obtener el email del usuario:', err);
          return res.status(500).send('Error al obtener la información del usuario');
        }

        const userEmail = userResult[0].email;
        const userName = userResult[0].nombre;

        // Preparar el contenido del correo
        const mailOptions = {
          from: 'elrinconverdeoficial@gmail.com',
          to: userEmail,  // Correo del usuario
          subject: 'Recibo de tu compra en El Rincón Verde',
          html: `
            <h1>Gracias por tu compra, ${userName}!</h1>
            <p>A continuación los detalles de tu pedido:</p>
            ${productsText}
            <p><strong>Total: $${total_con_iva}</strong></p>
            <p>¡Esperamos verte pronto!</p>
          `
        };

        // Enviar el correo de confirmación
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error al enviar el correo de confirmación:', error);
            return res.status(500).json({ error: 'Error al enviar el correo de confirmación' });
          }
          console.log('Correo de confirmación enviado: ' + info.response);
        });

        // Responder al cliente
        res.status(200).json({ pedidoId: pedidoId, total: total_con_iva });
      });
    });
  });
});

app.get('/api/pedidos/:usuario_id', (req, res) => {
  const usuarioId = req.params.usuario_id;

  const query = `
    SELECT 
      pedidos.id AS pedido_id, 
      pedidos.fecha_creacion, 
      pedidos.total, 
      plants.id AS plant_id,
      plants.name AS plant,  -- Alias correcto para el nombre del producto
      detalles_pedido.cantidad
    FROM 
      pedidos
    JOIN 
      detalles_pedido ON pedidos.id = detalles_pedido.pedido_id
    JOIN 
      plants ON detalles_pedido.plants_id = plants.id
    WHERE 
      pedidos.usuario_id = ?
    ORDER BY 
      pedidos.fecha_creacion DESC;
  `;

  db.query(query, [usuarioId], (err, results) => {
    if (err) {
      console.error('Error al obtener los pedidos:', err);
      return res.status(500).json({ error: 'Error al obtener los pedidos' });
    }

    // Agrupar los productos por pedido
    const orders = results.reduce((acc, row) => {
      const { pedido_id, fecha_creacion, total, plant_id, plant, cantidad } = row;

      // Si el pedido no está en el acumulador, lo agregamos
      if (!acc[pedido_id]) {
        acc[pedido_id] = {
          pedido_id,
          fecha_creacion,
          total,
          productos: []
        };
      }

      // Añadir el producto al pedido, incluyendo el id de la planta
      acc[pedido_id].productos.push({ id: plant_id, name: plant, cantidad });  // Usa 'plant' aquí

      return acc;
    }, {});

    // Convertimos el objeto a un array de resultados
    const ordersArray = Object.values(orders);
    
    res.status(200).json({ orders: ordersArray });
  });
});



// Iniciar el servidor
app.listen(5000, '0.0.0.0', () => {
  console.log('Server running on port 5000');
});
