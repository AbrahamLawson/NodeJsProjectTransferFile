const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(express.json());

const db = new Database(process.env.DATABASE_PATH, { verbose: console.log });

db.pragma('foreign_keys = ON');

const initDB = () => {
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        uploaded_bytes INTEGER DEFAULT 0
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        original_name TEXT,
        size INTEGER,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        data BLOB,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        share_token TEXT UNIQUE NOT NULL,
        share_expiry DATETIME NOT NULL,
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
    )`).run();
};

initDB();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    try {
        db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashedPassword);
        res.json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(400).json({ message: 'Username already exists' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }
    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = db.prepare("SELECT uploaded_bytes FROM users WHERE id = ?").get(userId);
    if (!user) {
        return res.status(500).json({ message: 'User not found' });
    }
    const newTotal = user.uploaded_bytes + file.size;
    if (newTotal > 2 * 1024 * 1024 * 1024) { // 2GB
        return res.status(400).json({ message: 'Upload quota exceeded' });
    }
    db.prepare("UPDATE users SET uploaded_bytes = ? WHERE id = ?").run(newTotal, userId);

    db.prepare("INSERT INTO files (user_id, original_name, size, data) VALUES (?, ?, ?, ?)").run(userId, file.originalname, file.size, file.buffer);
    res.json({ message: 'File uploaded successfully' });
});

app.get('/api/files', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const files = db.prepare("SELECT id, original_name, size, upload_date FROM files WHERE user_id = ?").all(userId);
    res.json({ files });
});

app.get('/api/files/:id', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const fileId = req.params.id;

    const file = db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(fileId, userId);
    if (!file) {
        return res.status(404).json({ message: 'File not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(file.data);
});

app.put('/api/files/:id/rename', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const fileId = req.params.id;
    const { newName } = req.body;

    if (!newName) {
        return res.status(400).json({ message: 'Nouveau nom requis.' });
    }

    try {
        const file = db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(fileId, userId);
        if (!file) {
            return res.status(404).json({ message: 'Fichier non trouvé.' });
        }
        db.prepare("UPDATE files SET original_name = ? WHERE id = ?").run(newName, fileId);
        res.json({ message: 'Fichier renommé avec succès.' });
    } catch (err) {
        console.error('Erreur lors du renommage du fichier:', err);
        res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

app.delete('/api/files/:id', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const fileId = req.params.id;

    const file = db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(fileId, userId);
    if (!file) {
        return res.status(404).json({ message: 'Fichier non trouvé.' });
    }

    try {
        const deleteTransaction = db.transaction(() => {
            db.prepare("DELETE FROM shares WHERE file_id = ?").run(fileId);
            db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
            db.prepare("UPDATE users SET uploaded_bytes = uploaded_bytes - ? WHERE id = ?").run(file.size, userId);
        });

        deleteTransaction();

        res.json({ message: 'Fichier supprimé avec succès.' });
    } catch (err) {
        console.error('Erreur lors de la suppression du fichier:', err);
        res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

app.post('/api/share', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { fileIds, duration } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ message: 'Aucun fichier sélectionné pour le partage.' });
    }

    if (!duration || typeof duration !== 'number' || duration <= 0) {
        return res.status(400).json({ message: 'Durée de validité invalide.' });
    }

    try {
        const createdShares = [];

        fileIds.forEach(fileId => {
            const file = db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(fileId, userId);
            if (!file) {
                return;
            }

            const shareToken = crypto.randomBytes(16).toString('hex');
            const shareExpiry = new Date(Date.now() + duration * 60000).toISOString();

            db.prepare(`INSERT INTO shares (file_id, share_token, share_expiry) VALUES (?, ?, ?)`)
              .run(fileId, shareToken, shareExpiry);

            const shareUrl = `${req.protocol}://${req.get('host')}/api/share/${shareToken}`;

            createdShares.push({
                shareUrl,
                shareExpiry
            });
        });

        if (createdShares.length === 0) {
            return res.status(400).json({ message: 'Aucun fichier valide sélectionné pour le partage.' });
        }

        res.json({ message: 'Liens de partage créés avec succès.', shareUrl: createdShares[0].shareUrl, shareExpiry: createdShares[0].shareExpiry });
    } catch (err) {
        console.error('Erreur lors de la création des liens de partage:', err);
        res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

app.get('/api/shares', authenticateToken, (req, res) => {
    const userId = req.user.id;

    try {
        const shares = db.prepare(`
            SELECT shares.id, shares.share_token, shares.share_expiry, files.original_name 
            FROM shares 
            JOIN files ON shares.file_id = files.id 
            WHERE files.user_id = ?
        `).all(userId);

        const formattedShares = shares.map(share => ({
            id: share.id,
            shareUrl: `${req.protocol}://${req.get('host')}/api/share/${share.share_token}`,
            shareExpiry: share.share_expiry,
            originalName: share.original_name
        }));

        res.json({ shares: formattedShares });
    } catch (err) {
        console.error('Erreur lors de la récupération des liens de partage:', err);
        res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

app.get('/api/share/:token', (req, res) => {
    const token = req.params.token;
    try {
        const share = db.prepare("SELECT * FROM shares WHERE share_token = ?").get(token);
        if (!share) {
            return res.status(404).json({ message: 'Lien de partage invalide.' });
        }

        const now = new Date();
        const expiryDate = new Date(share.shareExpiry);
        if (now > expiryDate) {
            return res.status(403).json({ message: 'Lien de partage expiré.' });
        }

        const file = db.prepare("SELECT * FROM files WHERE id = ?").get(share.file_id);
        if (!file) {
            return res.status(404).json({ message: 'Fichier non trouvé.' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(file.data);
    } catch (err) {
        console.error('Erreur lors de l\'accès au lien de partage:', err);
        res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

app.use('/', express.static(path.join(__dirname, 'frontend')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Database path: ${process.env.DATABASE_PATH}`);
});
