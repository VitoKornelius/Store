/* eslint-disable no-undef */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ініціалізація
dotenv.config();
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 5000;
const SALT_ROUNDS = 10;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'images')));

// Підключення до PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL'))
  .catch((err) => console.error('❌ Connection error', err));

// Маршрути API (існуючі залишив без змін)

// 1. Отримати всі категорії
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Отримати всі товари
app.get('/api/products', async (req, res) => {
  
  try {
    const result = await pool.query('SELECT * FROM products');
    const products = result.rows.map(product => ({
      ...product,
      image_url: `/images/${product.id}.jpg`,
    }));
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = result.rows[0];

    // Обробка всіх зображень з масиву image_urls
    if (product.image_urls && Array.isArray(product.image_urls)) {
      product.image_base64 = product.image_urls.map((imageName) => {
        const imagePath = path.join(__dirname, 'images', imageName);
        if (fs.existsSync(imagePath)) {
          try {
            const image = fs.readFileSync(imagePath);
            return image.toString('base64');
          } catch (fileError) {
            console.error(`Помилка зчитування зображення ${imageName}:`, fileError);
            return null;
          }
        } else {
          console.log(`Image not found: ${imageName}`);
          return null;
        }
      }).filter(img => img !== null);
    } else {
      product.image_base64 = [];
    }

    res.json(product);
  } catch (err) {
    console.error('Помилка отримання товару:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Додати новий товар
app.post('/api/products', async (req, res) => {
  const { name, description, price, category_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, description, price, category_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, price, category_id]
    );
    const newProduct = result.rows[0];
    newProduct.image_url = `/images/${newProduct.id}.jpg`;
    res.status(201).json(newProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Оновити товар
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, category_id = $4 WHERE id = $5 RETURNING *',
      [name, description, price, category_id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const updatedProduct = result.rows[0];
    updatedProduct.image_url = `/images/${updatedProduct.id}.jpg`;
    res.json(updatedProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Видалити товар
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 7. Отримання товарів за категорією
app.get('/api/categories/:id/products', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM products WHERE category_id = $1', [id]);
    const products = result.rows.map(product => ({
      ...product,
      image_url: `/images/${product.id}.jpg`,
    }));
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 8. Пошук по сайту
app.get('/api/search', async (req, res) => {
  const searchQuery = req.query.q;
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE name ILIKE $1 OR description ILIKE $1',
      [`%${searchQuery}%`]
    );
    const products = result.rows.map(product => ({
      ...product,
      image_url: `/images/${product.id}.jpg`,
    }));
    res.json(products);
  } catch (err) {
    console.error('Помилка пошуку товарів:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 9. Реєстрація користувача
app.post('/api/register', async (req, res) => {
  const { username, email, password, phone } = req.body;

  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Користувач з таким email вже існує' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const phoneValue = phone || null;

    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, phone, user_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [username, email, hashedPassword, phoneValue, 'customer']
    );

    res.status(201).json({ success: true, message: 'Реєстрація пройшла успішно', user: result.rows[0] });
  } catch (err) {
    console.error('Помилка реєстрації:', err);
    res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
  }
});

// 10. Вхід користувача
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Користувача не знайдено' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Невірний пароль' });
    }

    const userData = {
      id: user.rows[0].id,
      name: user.rows[0].name,
      email: user.rows[0].email,
      phone: user.rows[0].phone,
      user_type: user.rows[0].user_type,
    };

    res.json({ success: true, message: 'Вхід успішний', user: userData });
  } catch (err) {
    console.error('Помилка входу:', err);
    res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
  }
});

// 11. Додати у кошик
app.put('/api/cart/:id', async (req, res) => {
  const { product_id, user_id } = req.body;
  
  try {
    const existingItem = await pool.query(
      'SELECT * FROM carts WHERE product_id = $1 AND user_id = $2',
      [product_id, user_id]
    );

    if (existingItem.rows.length > 0) {
      return res.status(400).json({ error: 'Product already in cart' });
    }

    const result = await pool.query(
      'INSERT INTO carts (product_id, user_id) VALUES ($1, $2) RETURNING *',
      [product_id, user_id]
    );

    const newCartItem = result.rows[0];
    res.status(201).json(newCartItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/cart/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      'SELECT p.id, p.name, p.price, p.stock_quantity, p.image_urls  ' + 
      'FROM products p ' + 
      'JOIN carts c ON p.id = c.product_id ' + 
      'WHERE c.user_id = $1',
      [userId]
    );

    // Якщо товари знайдені, обробляємо їх
    if (result.rows.length > 0) {
      const products = result.rows.map(product => {
        if (product.image_urls && Array.isArray(product.image_urls)) {
          product.image_base64 = product.image_urls.map((imageName) => {
            const imagePath = path.join(__dirname, 'images', imageName);

            if (fs.existsSync(imagePath)) {
              try {
                const image = fs.readFileSync(imagePath);
                return image.toString('base64');
              } catch (fileError) {
                console.error(`Помилка при читанні зображення ${imageName}:`, fileError);
                return null;
              }
            } else {
              console.log(`Зображення не знайдено: ${imageName}`);
              return null;
            }
          }).filter(img => img !== null);
        } else {
          product.image_base64 = [];
        }
        return product;
      });

      res.status(200).json(products);
    } else {
      res.status(200).json([]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 12. Видалити товар з кошика користувача
app.delete('/api/cart/:userId/:productId', async (req, res) => {
  let { userId, productId } = req.params;

  if (isNaN(userId) || isNaN(productId)) {
    return res.status(400).json({ message: "Invalid user ID or product ID" });
  }

  try {
    const result = await pool.query(
      'DELETE FROM carts WHERE user_id = $1 AND product_id = $2 RETURNING *',
      [userId, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    res.json({ message: "Product removed from cart", deletedItem: result.rows[0] });
  } catch (error) {
    console.error("Error deleting product from cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 13. Змінити пароль користувача
app.put('/api/change-password', async (req, res) => {
  const { user_id, old_password, new_password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Користувача не знайдено' });
    }

    const user = userResult.rows[0];

    const isOldPasswordValid = await bcrypt.compare(old_password, user.password_hash);
    if (!isOldPasswordValid) {
      return res.status(400).json({ success: false, message: 'Невірний старий пароль' });
    }

    const hashedNewPassword = await bcrypt.hash(new_password, SALT_ROUNDS);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedNewPassword, user_id]);

    res.json({ success: true, message: 'Пароль успішно змінено' });
  } catch (err) {
    console.error('Помилка зміни пароля:', err);
    res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
  }
});

// 14. Оформлення замовлення
app.post('/api/orders', async (req, res) => {
  console.log("Отримано замовлення:", req.body);
  const { user_id, cart_items, contactEmail, contactName, contactPhone, shippingAddress, shippingCity, shippingMethod, payment_token, payment_method_id} = req.body;
  console.log("Дані замовлення:", req.body);

  try {
    // Розрахунок загальної суми
    let total_price = 0;
    for (const item of cart_items) {
      const product = await pool.query('SELECT price FROM products WHERE id = $1', [item.product_id]);
      if (product.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      total_price += product.rows[0].price * item.quantity;
    }

    // Створення замовлення
    const orderResult = await pool.query(
      'INSERT INTO orders (user_id, order_date, status, total_price) VALUES ($1, CURRENT_TIMESTAMP, $2, $3) RETURNING *',
      [user_id, 'processing', total_price]
    );

    const order = orderResult.rows[0];

    // Додавання елементів замовлення
    for (const item of cart_items) {
      const product = await pool.query('SELECT price FROM products WHERE id = $1', [item.product_id]);
      await pool.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [order.id, item.product_id, item.quantity, product.rows[0].price]
      );
    }

    // Заповнення таблиці order_info
    await pool.query(
      'INSERT INTO order_info (order_id, contact_email, contact_name, contact_phone, shipping_address, shipping_city, shipping_method, payment_token, payment_method_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [order.id, contactEmail, contactName, contactPhone, shippingAddress, shippingCity, shippingMethod, payment_token, payment_method_id]
    );

    // Очищення кошика користувача
    await pool.query('DELETE FROM carts WHERE user_id = $1', [user_id]);

    res.status(201).json({
      success: true,
      message: 'Замовлення успішно оформлено!',
      order_id: order.id,
    });
  } catch (err) {
    console.error('Помилка оформлення замовлення:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// 15. Отримати способи оплати
app.get('/api/payment-methods', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payment_methods');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 16. Отримати історію замовлень користувача
app.get('/api/orders/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      'SELECT o.id, o.order_date, o.status, o.total_price, o.payment_method_id FROM orders o WHERE o.user_id = $1',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});