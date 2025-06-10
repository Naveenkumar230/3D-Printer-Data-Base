const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Check file type
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Data storage (in production, use a proper database)
const DATA_FILE = path.join(__dirname, 'data', 'records.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Load data from file
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error loading data:', error);
        return [];
    }
}

// Save data to file
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all records
app.get('/api/records', (req, res) => {
    try {
        const records = loadData();
        res.json({ success: true, data: records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save a new record
app.post('/api/records', (req, res) => {
    try {
        const records = loadData();
        const newRecord = {
            ...req.body,
            id: Date.now().toString(),
            timestamp: new Date().toISOString()
        };
        
        records.push(newRecord);
        
        if (saveData(records)) {
            res.json({ success: true, data: newRecord });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save data' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update a record
app.put('/api/records/:id', (req, res) => {
    try {
        const records = loadData();
        const recordId = req.params.id;
        const recordIndex = records.findIndex(r => r.id === recordId);
        
        if (recordIndex === -1) {
            return res.status(404).json({ success: false, error: 'Record not found' });
        }
        
        records[recordIndex] = {
            ...records[recordIndex],
            ...req.body,
            timestamp: new Date().toISOString()
        };
        
        if (saveData(records)) {
            res.json({ success: true, data: records[recordIndex] });
        } else {
            res.status(500).json({ success: false, error: 'Failed to update data' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a record
app.delete('/api/records/:id', (req, res) => {
    try {
        const records = loadData();
        const recordId = req.params.id;
        const recordIndex = records.findIndex(r => r.id === recordId);
        
        if (recordIndex === -1) {
            return res.status(404).json({ success: false, error: 'Record not found' });
        }
        
        const deletedRecord = records.splice(recordIndex, 1)[0];
        
        if (saveData(records)) {
            res.json({ success: true, data: deletedRecord });
        } else {
            res.status(500).json({ success: false, error: 'Failed to delete data' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload image
app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ 
            success: true, 
            data: {
                filename: req.file.filename,
                originalName: req.file.originalname,
                url: imageUrl,
                size: req.file.size
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Export data to Excel
app.get('/api/export/excel', (req, res) => {
    try {
        const records = loadData();
        
        if (records.length === 0) {
            return res.status(400).json({ success: false, error: 'No data to export' });
        }
        
        // Set headers for Excel download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="3D_Printing_Records.xlsx"');
        
        // Send the records data - client will handle Excel generation
        res.json({ success: true, data: records });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Backup data
app.get('/api/backup', (req, res) => {
    try {
        const records = loadData();
        const backupData = {
            timestamp: new Date().toISOString(),
            recordCount: records.length,
            data: records
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="3d_printing_backup.json"');
        res.json(backupData);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Restore data from backup
app.post('/api/restore', (req, res) => {
    try {
        const backupData = req.body;
        
        if (!backupData.data || !Array.isArray(backupData.data)) {
            return res.status(400).json({ success: false, error: 'Invalid backup data format' });
        }
        
        if (saveData(backupData.data)) {
            res.json({ 
                success: true, 
                message: `Restored ${backupData.data.length} records successfully` 
            });
        } else {
            res.status(500).json({ success: false, error: 'Failed to restore data' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear all data
app.delete('/api/records', (req, res) => {
    try {
        if (saveData([])) {
            res.json({ success: true, message: 'All data cleared successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to clear data' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: '3D Printing Database Server is running',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'File too large. Maximum size is 10MB.' });
        }
    }
    
    console.error('Server error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 3D Printing Database Server running on port ${PORT}`);
    console.log(`📱 Access the application at: http://localhost:${PORT}`);
    console.log(`📊 API endpoints available at: http://localhost:${PORT}/api/`);
    console.log(`📁 Data stored in: ${DATA_FILE}`);
    console.log(`🖼️  Images stored in: ${path.join(__dirname, 'uploads')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Server shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 Server shutting down gracefully...');
    process.exit(0);
});