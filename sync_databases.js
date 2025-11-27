const mysql = require('mysql2/promise');

// Source database (backup - EMS 18-backup)
const SOURCE_CONFIG = {
  host: '168.119.147.252',
  user: 'gofashionuser',
  password: 'AH2?6lv^Csllikr3',
  database: 'admin_gofashiondb',
  port: 3306,
  connectTimeout: 60000,
  charset: 'utf8mb4'
};

// Destination database (new - EMS-upload-github)
const DESTINATION_CONFIG = {
  host: '78.46.128.21',
  user: 'root',
  password: 'jhgklfgsf789',
  database: 'admin_gofashiondb',
  port: 3306,
  connectTimeout: 60000,
  charset: 'utf8mb4'
};

const BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE || '1000', 10);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to compare two values (handling null, dates, etc.)
function valuesEqual(val1, val2) {
  if (val1 === null && val2 === null) return true;
  if (val1 === null || val2 === null) return false;
  
  // Convert to string for comparison (handles dates, numbers, etc.)
  const str1 = String(val1);
  const str2 = String(val2);
  
  return str1 === str2;
}

// Helper function to check if two rows are different
function rowsDiffer(row1, row2, columns) {
  for (const col of columns) {
    if (!valuesEqual(row1[col], row2[col])) {
      return true;
    }
  }
  return false;
}

// Get primary key columns or all columns if no primary key
async function getKeyColumns(connection, table) {
  const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  const primaryKeys = columnsResult
    .filter(col => col.Key && col.Key.toUpperCase() === 'PRI')
    .map(col => col.Field);
  
  if (primaryKeys.length > 0) {
    return primaryKeys;
  }
  
  // If no primary key, use all columns as key
  return columnsResult.map(col => col.Field);
}

// Build WHERE clause for matching rows
function buildWhereClause(keyColumns, row) {
  return keyColumns.map(col => `\`${col}\` = ?`).join(' AND ');
}

// Build UPDATE SET clause
function buildUpdateClause(columns, keyColumns) {
  const updateColumns = columns.filter(col => !keyColumns.includes(col));
  return updateColumns.map(col => `\`${col}\` = ?`).join(', ');
}

async function syncTable(source, destination, table) {
  console.log(`\n🔄 Syncing table: ${table}`);
  
  // Get table structure
  const [[showCreate]] = await source.query(`SHOW CREATE TABLE \`${table}\``);
  let createStatement = showCreate['Create Table'];
  if (!createStatement.toUpperCase().includes('IF NOT EXISTS')) {
    createStatement = createStatement.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS');
  }
  await destination.query(createStatement);
  console.log(`   ✅ Table structure ensured`);
  
  // Get columns
  const [columnsResult] = await source.query(`SHOW COLUMNS FROM \`${table}\``);
  const allColumns = columnsResult.map(col => col.Field);
  const insertableColumns = columnsResult
    .filter(col => !(col.Extra && col.Extra.toUpperCase().includes('GENERATED')))
    .map(col => col.Field);
  
  if (insertableColumns.length === 0) {
    console.log(`   ⚠️  Table ${table} has no insertable columns. Skipping.`);
    return { inserted: 0, updated: 0, skipped: 0 };
  }
  
  // Get key columns (primary keys or all columns)
  const sourceKeyColumns = await getKeyColumns(source, table);
  const destKeyColumns = await getKeyColumns(destination, table);
  
  // Ensure key columns match
  if (JSON.stringify(sourceKeyColumns.sort()) !== JSON.stringify(destKeyColumns.sort())) {
    console.log(`   ⚠️  Key columns differ between source and destination. Using source keys.`);
  }
  const keyColumns = sourceKeyColumns;
  
  // Count rows
  const [[{ sourceCount }]] = await source.query(`SELECT COUNT(*) as sourceCount FROM \`${table}\``);
  const [[{ destCount }]] = await destination.query(`SELECT COUNT(*) as destCount FROM \`${table}\``);
  
  console.log(`   📊 Source rows: ${sourceCount}, Destination rows: ${destCount}`);
  
  if (sourceCount === 0) {
    console.log(`   ⏩ No rows in source. Skipping.`);
    return { inserted: 0, updated: 0, skipped: 0 };
  }
  
  // Fetch all source rows in batches
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let offset = 0;
  let batchNumber = 1;
  
  const quotedColumns = insertableColumns.map(col => `\`${col}\``);
  const columnList = quotedColumns.join(', ');
  const placeholders = insertableColumns.map(() => '?').join(', ');
  
  // Prepare statements
  const insertSql = `INSERT INTO \`${table}\` (${columnList}) VALUES (${placeholders})`;
  const updateColumns = insertableColumns.filter(col => !keyColumns.includes(col));
  const updateSql = updateColumns.length > 0 
    ? `UPDATE \`${table}\` SET ${buildUpdateClause(insertableColumns, keyColumns)} WHERE ${buildWhereClause(keyColumns, {})}`
    : null;
  
  while (offset < sourceCount) {
    // Fetch batch from source
    const [sourceRows] = await source.query(
      `SELECT ${columnList} FROM \`${table}\` LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset]
    );
    
    if (sourceRows.length === 0) {
      break;
    }
    
    console.log(`   📦 Processing batch ${batchNumber} (${sourceRows.length} rows)...`);
    
    try {
      await destination.beginTransaction();
      
      for (const sourceRow of sourceRows) {
        // Build key values for WHERE clause
        const keyValues = keyColumns.map(col => sourceRow[col]);
        
        // Check if row exists in destination
        const whereClause = buildWhereClause(keyColumns, sourceRow);
        const [existingRows] = await destination.query(
          `SELECT ${columnList} FROM \`${table}\` WHERE ${whereClause}`,
          keyValues
        );
        
        if (existingRows.length === 0) {
          // Row doesn't exist - INSERT
          const values = insertableColumns.map(col => sourceRow[col]);
          await destination.query(insertSql, values);
          inserted++;
        } else {
          // Row exists - check if different
          const existingRow = existingRows[0];
          
          if (rowsDiffer(sourceRow, existingRow, insertableColumns)) {
            // Row is different - UPDATE
            if (updateSql) {
              const updateValues = updateColumns.map(col => sourceRow[col]);
              const whereValues = keyColumns.map(col => sourceRow[col]);
              await destination.query(updateSql, [...updateValues, ...whereValues]);
              updated++;
            } else {
              // No columns to update (only key columns)
              skipped++;
            }
          } else {
            // Row is identical - SKIP
            skipped++;
          }
        }
      }
      
      await destination.commit();
      console.log(`   ✅ Batch ${batchNumber}: +${inserted} inserted, ~${updated} updated, -${skipped} skipped`);
      
    } catch (batchError) {
      await destination.rollback();
      console.error(`   ❌ Error in batch ${batchNumber}:`, batchError.message);
      throw batchError;
    }
    
    offset += sourceRows.length;
    batchNumber++;
    
    // Small delay between batches
    if (sourceRows.length === BATCH_SIZE) {
      await delay(50);
    }
  }
  
  return { inserted, updated, skipped };
}

async function syncDatabases() {
  let source;
  let destination;

  try {
    console.log('🔌 Connecting to source database...');
    source = await mysql.createConnection({ ...SOURCE_CONFIG, multipleStatements: true });
    console.log(`✅ Connected to source: ${SOURCE_CONFIG.host}:${SOURCE_CONFIG.port}/${SOURCE_CONFIG.database}`);

    console.log('🔌 Connecting to destination database...');
    destination = await mysql.createConnection({ ...DESTINATION_CONFIG, multipleStatements: true });
    console.log(`✅ Connected to destination: ${DESTINATION_CONFIG.host}:${DESTINATION_CONFIG.port}/${DESTINATION_CONFIG.database}`);

    // Get list of tables
    const [tablesResult] = await source.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
    let tables = tablesResult.map(row => Object.values(row)[0]);

    // Tables to skip (optional - set via environment variable)
    const skippedTables = (process.env.SYNC_SKIP_TABLES || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    if (skippedTables.length) {
      tables = tables.filter(tableName => !skippedTables.includes(tableName));
      console.log(`⚠️  Skipping tables: ${skippedTables.join(', ')}`);
    }

    if (!tables.length) {
      console.log('⚠️  No tables found in source database.');
      return;
    }

    console.log(`\n📋 Found ${tables.length} tables to sync.\n`);

    // Disable foreign key checks for faster syncing
    await destination.query('SET FOREIGN_KEY_CHECKS = 0');

    const summary = {
      totalTables: tables.length,
      totalInserted: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      errors: []
    };

    // Sync each table
    for (const table of tables) {
      try {
        const result = await syncTable(source, destination, table);
        summary.totalInserted += result.inserted;
        summary.totalUpdated += result.updated;
        summary.totalSkipped += result.skipped;
      } catch (error) {
        console.error(`   ❌ Error syncing table ${table}:`, error.message);
        summary.errors.push({ table, error: error.message });
      }
    }

    // Re-enable foreign key checks
    await destination.query('SET FOREIGN_KEY_CHECKS = 1');

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SYNC SUMMARY');
    console.log('='.repeat(60));
    console.log(`Tables processed: ${summary.totalTables}`);
    console.log(`Rows inserted: ${summary.totalInserted}`);
    console.log(`Rows updated: ${summary.totalUpdated}`);
    console.log(`Rows skipped (identical): ${summary.totalSkipped}`);
    
    if (summary.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${summary.errors.length}`);
      summary.errors.forEach(({ table, error }) => {
        console.log(`   - ${table}: ${error}`);
      });
    }
    
    console.log('\n🎉 Database sync complete!');
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    if (source) {
      await source.end();
    }
    if (destination) {
      await destination.end();
    }
  }
}

// Run the sync
syncDatabases();

