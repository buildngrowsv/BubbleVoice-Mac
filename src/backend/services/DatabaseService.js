/**
 * DATABASE SERVICE
 * 
 * Purpose:
 * Manages SQLite database for persistent storage of conversations, messages,
 * life areas, area entries, artifacts, and settings.
 * 
 * Architecture:
 * - Uses better-sqlite3 for synchronous SQLite operations
 * - Implements migrations for schema versioning
 * - Provides CRUD operations for all tables
 * - Maintains referential integrity with foreign keys
 * 
 * Why SQLite:
 * - Embedded database (no server needed)
 * - Fast for local data
 * - ACID compliant
 * - Perfect for desktop apps
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * DatabaseService Class
 * 
 * Manages all database operations for BubbleVoice Mac.
 * Handles conversations, messages, life areas, entries, artifacts, and settings.
 */
class DatabaseService {
    /**
     * Constructor
     * 
     * @param {string} dbPath - Path to SQLite database file
     * 
     * Why we pass the path:
     * - Allows different paths for testing vs production
     * - Makes service testable with in-memory databases
     */
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        
        console.log(`[DatabaseService] Initialized with path: ${dbPath}`);
    }

    /**
     * Initialize Database
     * 
     * Creates database file if it doesn't exist, opens connection,
     * enables foreign keys, and runs migrations.
     * 
     * Why we enable foreign keys:
     * - SQLite has foreign keys disabled by default
     * - We need them for referential integrity
     * - Prevents orphaned records
     */
    initialize() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`[DatabaseService] Created directory: ${dir}`);
            }

            // Open database connection
            // verbose: logs all SQL statements (useful for debugging)
            this.db = new Database(this.dbPath, { 
                verbose: process.env.NODE_ENV === 'development' ? console.log : null 
            });

            // Enable foreign keys (CRITICAL: must be done per connection)
            this.db.pragma('foreign_keys = ON');

            // Enable WAL mode for better concurrency
            // WAL = Write-Ahead Logging, allows reads while writing
            this.db.pragma('journal_mode = WAL');

            console.log('[DatabaseService] Database opened successfully');

            // Run migrations to create/update schema
            this.runMigrations();

            console.log('[DatabaseService] Initialization complete');
        } catch (error) {
            console.error('[DatabaseService] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Run Database Migrations
     * 
     * Creates all tables if they don't exist.
     * In the future, this will handle schema upgrades.
     * 
     * Why migrations:
     * - Allows schema evolution over time
     * - Ensures all users have correct schema
     * - Can add new tables/columns without breaking existing data
     */
    runMigrations() {
        console.log('[DatabaseService] Running migrations...');

        try {
            // Migration 1: Create conversations table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT
                )
            `);
            console.log('[DatabaseService] ✅ Conversations table ready');

            // Migration 2: Create messages table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
                    content TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
            `);
            console.log('[DatabaseService] ✅ Messages table ready');

            // Migration 3: Create life_areas table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS life_areas (
                    id TEXT PRIMARY KEY,
                    path TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    parent_path TEXT,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    entry_count INTEGER DEFAULT 0,
                    last_activity DATETIME
                )
            `);
            console.log('[DatabaseService] ✅ Life areas table ready');

            // Migration 4: Create area_entries table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS area_entries (
                    id TEXT PRIMARY KEY,
                    area_path TEXT NOT NULL,
                    document_name TEXT NOT NULL,
                    timestamp DATETIME NOT NULL,
                    content TEXT NOT NULL,
                    user_quote TEXT,
                    ai_observation TEXT,
                    sentiment TEXT,
                    conversation_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (area_path) REFERENCES life_areas(path) ON DELETE CASCADE,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
                )
            `);
            console.log('[DatabaseService] ✅ Area entries table ready');

            // Migration 5: Create artifacts table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS artifacts (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    artifact_type TEXT NOT NULL,
                    html_content TEXT NOT NULL,
                    json_data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    turn_number INTEGER,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
            `);
            console.log('[DatabaseService] ✅ Artifacts table ready');

            // Migration 6: Create settings table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('[DatabaseService] ✅ Settings table ready');

            // Create indexes for better query performance
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_messages_conversation 
                ON messages(conversation_id);
                
                CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
                ON messages(timestamp DESC);
                
                CREATE INDEX IF NOT EXISTS idx_area_entries_area 
                ON area_entries(area_path);
                
                CREATE INDEX IF NOT EXISTS idx_area_entries_timestamp 
                ON area_entries(timestamp DESC);
                
                CREATE INDEX IF NOT EXISTS idx_artifacts_conversation 
                ON artifacts(conversation_id);
            `);
            console.log('[DatabaseService] ✅ Indexes created');

            console.log('[DatabaseService] All migrations complete');
        } catch (error) {
            console.error('[DatabaseService] Migration failed:', error);
            throw error;
        }
    }

    /**
     * Close Database Connection
     * 
     * Should be called when app shuts down.
     * Ensures all writes are flushed to disk.
     */
    close() {
        if (this.db) {
            this.db.close();
            console.log('[DatabaseService] Database closed');
        }
    }

    // ==========================================
    // CONVERSATIONS CRUD
    // ==========================================

    /**
     * Create Conversation
     * 
     * @param {string} id - Unique conversation ID
     * @param {string} title - Conversation title
     * @param {object} metadata - Additional metadata (JSON)
     * @returns {object} Created conversation
     */
    createConversation(id, title, metadata = {}) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO conversations (id, title, metadata)
                VALUES (?, ?, ?)
            `);

            stmt.run(id, title, JSON.stringify(metadata));

            console.log(`[DatabaseService] Created conversation: ${id}`);
            return this.getConversation(id);
        } catch (error) {
            console.error('[DatabaseService] Failed to create conversation:', error);
            throw error;
        }
    }

    /**
     * Get Conversation by ID
     * 
     * @param {string} id - Conversation ID
     * @returns {object|null} Conversation or null if not found
     */
    getConversation(id) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM conversations WHERE id = ?
            `);

            const row = stmt.get(id);
            
            if (row && row.metadata) {
                row.metadata = JSON.parse(row.metadata);
            }

            return row || null;
        } catch (error) {
            console.error('[DatabaseService] Failed to get conversation:', error);
            throw error;
        }
    }

    /**
     * Get All Conversations
     * 
     * @param {number} limit - Max number to return (default: 100)
     * @param {number} offset - Offset for pagination (default: 0)
     * @returns {array} Array of conversations
     */
    getAllConversations(limit = 100, offset = 0) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM conversations 
                ORDER BY updated_at DESC 
                LIMIT ? OFFSET ?
            `);

            const rows = stmt.all(limit, offset);
            
            return rows.map(row => {
                if (row.metadata) {
                    row.metadata = JSON.parse(row.metadata);
                }
                return row;
            });
        } catch (error) {
            console.error('[DatabaseService] Failed to get conversations:', error);
            throw error;
        }
    }

    /**
     * Update Conversation
     * 
     * @param {string} id - Conversation ID
     * @param {object} updates - Fields to update (title, metadata)
     * @returns {object} Updated conversation
     */
    updateConversation(id, updates) {
        try {
            const fields = [];
            const values = [];

            if (updates.title) {
                fields.push('title = ?');
                values.push(updates.title);
            }

            if (updates.metadata) {
                fields.push('metadata = ?');
                values.push(JSON.stringify(updates.metadata));
            }

            // Always update updated_at
            fields.push('updated_at = CURRENT_TIMESTAMP');

            if (fields.length === 1) {
                // Only updated_at, no actual changes
                return this.getConversation(id);
            }

            values.push(id);

            const stmt = this.db.prepare(`
                UPDATE conversations 
                SET ${fields.join(', ')} 
                WHERE id = ?
            `);

            stmt.run(...values);

            console.log(`[DatabaseService] Updated conversation: ${id}`);
            return this.getConversation(id);
        } catch (error) {
            console.error('[DatabaseService] Failed to update conversation:', error);
            throw error;
        }
    }

    /**
     * Delete Conversation
     * 
     * Cascade deletes all messages, artifacts, etc.
     * 
     * @param {string} id - Conversation ID
     * @returns {boolean} True if deleted
     */
    deleteConversation(id) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM conversations WHERE id = ?
            `);

            const result = stmt.run(id);

            console.log(`[DatabaseService] Deleted conversation: ${id}`);
            return result.changes > 0;
        } catch (error) {
            console.error('[DatabaseService] Failed to delete conversation:', error);
            throw error;
        }
    }

    // ==========================================
    // MESSAGES CRUD
    // ==========================================

    /**
     * Add Message
     * 
     * @param {string} conversationId - Conversation ID
     * @param {string} role - 'user', 'assistant', or 'system'
     * @param {string} content - Message content
     * @param {object} metadata - Additional metadata
     * @returns {object} Created message
     */
    addMessage(conversationId, role, content, metadata = {}) {
        try {
            const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const stmt = this.db.prepare(`
                INSERT INTO messages (id, conversation_id, role, content, metadata)
                VALUES (?, ?, ?, ?, ?)
            `);

            stmt.run(id, conversationId, role, content, JSON.stringify(metadata));

            // Update conversation's updated_at
            this.updateConversation(conversationId, {});

            console.log(`[DatabaseService] Added message to ${conversationId}`);
            return this.getMessage(id);
        } catch (error) {
            console.error('[DatabaseService] Failed to add message:', error);
            throw error;
        }
    }

    /**
     * Get Message by ID
     * 
     * @param {string} id - Message ID
     * @returns {object|null} Message or null
     */
    getMessage(id) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM messages WHERE id = ?
            `);

            const row = stmt.get(id);
            
            if (row && row.metadata) {
                row.metadata = JSON.parse(row.metadata);
            }

            return row || null;
        } catch (error) {
            console.error('[DatabaseService] Failed to get message:', error);
            throw error;
        }
    }

    /**
     * Get Messages for Conversation
     * 
     * @param {string} conversationId - Conversation ID
     * @param {number} limit - Max messages to return
     * @param {number} offset - Offset for pagination
     * @returns {array} Array of messages
     */
    getMessages(conversationId, limit = 100, offset = 0) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM messages 
                WHERE conversation_id = ? 
                ORDER BY timestamp ASC 
                LIMIT ? OFFSET ?
            `);

            const rows = stmt.all(conversationId, limit, offset);
            
            return rows.map(row => {
                if (row.metadata) {
                    row.metadata = JSON.parse(row.metadata);
                }
                return row;
            });
        } catch (error) {
            console.error('[DatabaseService] Failed to get messages:', error);
            throw error;
        }
    }

    /**
     * Get Message Count for Conversation
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {number} Number of messages
     */
    getMessageCount(conversationId) {
        try {
            const stmt = this.db.prepare(`
                SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?
            `);

            const result = stmt.get(conversationId);
            return result.count;
        } catch (error) {
            console.error('[DatabaseService] Failed to get message count:', error);
            throw error;
        }
    }

    // ==========================================
    // LIFE AREAS CRUD
    // ==========================================

    /**
     * Create Life Area
     * 
     * @param {string} path - Area path (e.g., "Family/Emma_School")
     * @param {string} name - Human-readable name
     * @param {string} parentPath - Parent area path (optional)
     * @param {string} description - Area description
     * @returns {object} Created area
     */
    createArea(path, name, parentPath = null, description = '') {
        try {
            const id = `area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const stmt = this.db.prepare(`
                INSERT INTO life_areas (id, path, name, parent_path, description, last_activity)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            stmt.run(id, path, name, parentPath, description);

            console.log(`[DatabaseService] Created area: ${path}`);
            return this.getArea(path);
        } catch (error) {
            console.error('[DatabaseService] Failed to create area:', error);
            throw error;
        }
    }

    /**
     * Get Area by Path
     * 
     * @param {string} path - Area path
     * @returns {object|null} Area or null
     */
    getArea(path) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM life_areas WHERE path = ?
            `);

            return stmt.get(path) || null;
        } catch (error) {
            console.error('[DatabaseService] Failed to get area:', error);
            throw error;
        }
    }

    /**
     * Get All Areas
     * 
     * @returns {array} Array of all areas
     */
    getAllAreas() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM life_areas ORDER BY path ASC
            `);

            return stmt.all();
        } catch (error) {
            console.error('[DatabaseService] Failed to get areas:', error);
            throw error;
        }
    }

    /**
     * Update Area
     * 
     * @param {string} path - Area path
     * @param {object} updates - Fields to update
     * @returns {object} Updated area
     */
    updateArea(path, updates) {
        try {
            const fields = [];
            const values = [];

            if (updates.name) {
                fields.push('name = ?');
                values.push(updates.name);
            }

            if (updates.description !== undefined) {
                fields.push('description = ?');
                values.push(updates.description);
            }

            if (updates.entry_count !== undefined) {
                fields.push('entry_count = ?');
                values.push(updates.entry_count);
            }

            fields.push('updated_at = CURRENT_TIMESTAMP');
            fields.push('last_activity = CURRENT_TIMESTAMP');

            if (fields.length === 2) {
                // Only timestamps, no actual changes
                return this.getArea(path);
            }

            values.push(path);

            const stmt = this.db.prepare(`
                UPDATE life_areas 
                SET ${fields.join(', ')} 
                WHERE path = ?
            `);

            stmt.run(...values);

            console.log(`[DatabaseService] Updated area: ${path}`);
            return this.getArea(path);
        } catch (error) {
            console.error('[DatabaseService] Failed to update area:', error);
            throw error;
        }
    }

    /**
     * Delete Area
     * 
     * Cascade deletes all entries.
     * 
     * @param {string} path - Area path
     * @returns {boolean} True if deleted
     */
    deleteArea(path) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM life_areas WHERE path = ?
            `);

            const result = stmt.run(path);

            console.log(`[DatabaseService] Deleted area: ${path}`);
            return result.changes > 0;
        } catch (error) {
            console.error('[DatabaseService] Failed to delete area:', error);
            throw error;
        }
    }

    /**
     * Get Areas Tree
     * 
     * Returns hierarchical structure of areas.
     * Used for prompt injection.
     * 
     * @returns {object} Tree structure
     */
    getAreasTree() {
        try {
            const areas = this.getAllAreas();
            
            // Build tree structure
            const tree = {};
            
            areas.forEach(area => {
                const parts = area.path.split('/');
                let current = tree;
                
                parts.forEach((part, index) => {
                    if (!current[part]) {
                        current[part] = {
                            name: index === parts.length - 1 ? area.name : part,
                            path: parts.slice(0, index + 1).join('/'),
                            entry_count: index === parts.length - 1 ? area.entry_count : 0,
                            last_activity: index === parts.length - 1 ? area.last_activity : null,
                            children: {}
                        };
                    }
                    current = current[part].children;
                });
            });

            return tree;
        } catch (error) {
            console.error('[DatabaseService] Failed to get areas tree:', error);
            throw error;
        }
    }

    // ==========================================
    // AREA ENTRIES CRUD
    // ==========================================

    /**
     * Add Entry to Area
     * 
     * @param {string} areaPath - Area path
     * @param {string} documentName - Document name (e.g., "reading_comprehension.md")
     * @param {object} entry - Entry data
     * @returns {object} Created entry
     */
    addEntry(areaPath, documentName, entry) {
        try {
            const id = `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const stmt = this.db.prepare(`
                INSERT INTO area_entries (
                    id, area_path, document_name, timestamp, content, 
                    user_quote, ai_observation, sentiment, conversation_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                id,
                areaPath,
                documentName,
                entry.timestamp || new Date().toISOString(),
                entry.content,
                entry.user_quote || null,
                entry.ai_observation || null,
                entry.sentiment || null,
                entry.conversation_id || null
            );

            // Update area's entry count and last activity
            const area = this.getArea(areaPath);
            if (area) {
                this.updateArea(areaPath, {
                    entry_count: area.entry_count + 1
                });
            }

            console.log(`[DatabaseService] Added entry to ${areaPath}/${documentName}`);
            return this.getEntry(id);
        } catch (error) {
            console.error('[DatabaseService] Failed to add entry:', error);
            throw error;
        }
    }

    /**
     * Get Entry by ID
     * 
     * @param {string} id - Entry ID
     * @returns {object|null} Entry or null
     */
    getEntry(id) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM area_entries WHERE id = ?
            `);

            return stmt.get(id) || null;
        } catch (error) {
            console.error('[DatabaseService] Failed to get entry:', error);
            throw error;
        }
    }

    /**
     * Get Entries for Area/Document
     * 
     * @param {string} areaPath - Area path
     * @param {string} documentName - Document name
     * @param {number} limit - Max entries to return
     * @returns {array} Array of entries (newest first)
     */
    getEntries(areaPath, documentName, limit = 50) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM area_entries 
                WHERE area_path = ? AND document_name = ? 
                ORDER BY timestamp DESC 
                LIMIT ?
            `);

            return stmt.all(areaPath, documentName, limit);
        } catch (error) {
            console.error('[DatabaseService] Failed to get entries:', error);
            throw error;
        }
    }

    /**
     * Get Recent Entries Across All Areas
     * 
     * @param {number} limit - Max entries to return
     * @returns {array} Array of recent entries
     */
    getRecentEntries(limit = 20) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM area_entries 
                ORDER BY timestamp DESC 
                LIMIT ?
            `);

            return stmt.all(limit);
        } catch (error) {
            console.error('[DatabaseService] Failed to get recent entries:', error);
            throw error;
        }
    }

    /**
     * Search Entries
     * 
     * Simple text search across content, user quotes, and AI observations.
     * For semantic search, use VectorStoreService.
     * 
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {array} Matching entries
     */
    searchEntries(query, limit = 20) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM area_entries 
                WHERE content LIKE ? 
                   OR user_quote LIKE ? 
                   OR ai_observation LIKE ? 
                ORDER BY timestamp DESC 
                LIMIT ?
            `);

            const searchTerm = `%${query}%`;
            return stmt.all(searchTerm, searchTerm, searchTerm, limit);
        } catch (error) {
            console.error('[DatabaseService] Failed to search entries:', error);
            throw error;
        }
    }

    // ==========================================
    // ARTIFACTS CRUD
    // ==========================================

    /**
     * Save Artifact
     * 
     * @param {string} conversationId - Conversation ID
     * @param {object} artifact - Artifact data
     * @returns {object} Saved artifact
     */
    saveArtifact(conversationId, artifact) {
        try {
            const id = artifact.artifact_id || `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const stmt = this.db.prepare(`
                INSERT INTO artifacts (
                    id, conversation_id, artifact_type, html_content, 
                    json_data, turn_number
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                id,
                conversationId,
                artifact.artifact_type,
                artifact.html,
                artifact.data ? JSON.stringify(artifact.data) : null,
                artifact.turn_number || null
            );

            console.log(`[DatabaseService] Saved artifact: ${id}`);
            return this.getArtifact(id);
        } catch (error) {
            console.error('[DatabaseService] Failed to save artifact:', error);
            throw error;
        }
    }

    /**
     * Get Artifact by ID
     * 
     * @param {string} id - Artifact ID
     * @returns {object|null} Artifact or null
     */
    getArtifact(id) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM artifacts WHERE id = ?
            `);

            const row = stmt.get(id);
            
            if (row && row.json_data) {
                row.json_data = JSON.parse(row.json_data);
            }

            return row || null;
        } catch (error) {
            console.error('[DatabaseService] Failed to get artifact:', error);
            throw error;
        }
    }

    /**
     * Get Artifacts by Conversation
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {array} Array of artifacts
     */
    getArtifactsByConversation(conversationId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM artifacts 
                WHERE conversation_id = ? 
                ORDER BY created_at ASC
            `);

            const rows = stmt.all(conversationId);
            
            return rows.map(row => {
                if (row.json_data) {
                    row.json_data = JSON.parse(row.json_data);
                }
                return row;
            });
        } catch (error) {
            console.error('[DatabaseService] Failed to get artifacts:', error);
            throw error;
        }
    }

    /**
     * Delete Artifact
     * 
     * @param {string} id - Artifact ID
     * @returns {boolean} True if deleted
     */
    deleteArtifact(id) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM artifacts WHERE id = ?
            `);

            const result = stmt.run(id);

            console.log(`[DatabaseService] Deleted artifact: ${id}`);
            return result.changes > 0;
        } catch (error) {
            console.error('[DatabaseService] Failed to delete artifact:', error);
            throw error;
        }
    }

    // ==========================================
    // SETTINGS CRUD
    // ==========================================

    /**
     * Get Setting
     * 
     * @param {string} key - Setting key
     * @returns {string|null} Setting value or null
     */
    getSetting(key) {
        try {
            const stmt = this.db.prepare(`
                SELECT value FROM settings WHERE key = ?
            `);

            const row = stmt.get(key);
            return row ? row.value : null;
        } catch (error) {
            console.error('[DatabaseService] Failed to get setting:', error);
            throw error;
        }
    }

    /**
     * Set Setting
     * 
     * @param {string} key - Setting key
     * @param {string} value - Setting value
     * @returns {boolean} True if set
     */
    setSetting(key, value) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO settings (key, value) 
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET 
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `);

            stmt.run(key, value);

            console.log(`[DatabaseService] Set setting: ${key}`);
            return true;
        } catch (error) {
            console.error('[DatabaseService] Failed to set setting:', error);
            throw error;
        }
    }

    /**
     * Get All Settings
     * 
     * @returns {object} Object with all settings
     */
    getAllSettings() {
        try {
            const stmt = this.db.prepare(`
                SELECT key, value FROM settings
            `);

            const rows = stmt.all();
            
            const settings = {};
            rows.forEach(row => {
                settings[row.key] = row.value;
            });

            return settings;
        } catch (error) {
            console.error('[DatabaseService] Failed to get all settings:', error);
            throw error;
        }
    }
}

module.exports = DatabaseService;
