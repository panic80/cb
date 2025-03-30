// Initialize IndexedDB database with enhanced error handling and logging
export const initDB = (dbName, version, upgradeCallback) => {
  return new Promise((resolve, reject) => {
    console.log(`Initializing IndexedDB: ${dbName} (v${version})`);
    const request = indexedDB.open(dbName, version);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject(request.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      console.log(`Successfully opened IndexedDB: ${dbName}`);

      // Add error handler for all database operations
      db.onerror = (event) => {
        console.error("Database error:", event.target.error);
      };

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log(`Upgrading IndexedDB: ${dbName}`);
      const db = event.target.result;
      try {
        upgradeCallback(db);
        console.log("Database upgrade completed successfully");
      } catch (error) {
        console.error("Error during database upgrade:", error);
        throw error;
      }
    };

    request.onblocked = (_event) => {
      // Prefix unused event with underscore
      console.warn(
        "Database upgrade blocked. Please close other tabs and refresh."
      );
    };
  });
};

// Generic function to add data to any store with enhanced error handling
export const addToStore = async (db, storeName, data) => {
  return new Promise((resolve, reject) => {
    console.log(`Adding data to store: ${storeName}`, data);

    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => {
      console.log(`Successfully added data to ${storeName}`);
    };

    transaction.onerror = (event) => {
      console.error(
        `Error in transaction for ${storeName}:`,
        event.target.error
      );
      reject(transaction.error);
    };

    try {
      const request = store.add(data);

      request.onsuccess = (event) => {
        const key = event.target.result;
        console.log(`Data added successfully with key: ${key}`);
        resolve(key);
      };

      request.onerror = (event) => {
        console.error(`Error adding data to ${storeName}:`, event.target.error);
        reject(request.error);
      };
    } catch (error) {
      console.error(`Exception while adding data to ${storeName}:`, error);
      reject(error);
    }
  });
};

// Generic function to get all data from any store with enhanced error handling
export const getAllFromStore = async (db, storeName) => {
  return new Promise((resolve, reject) => {
    console.log(`Getting all data from store: ${storeName}`);

    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => {
      console.log(`Successfully completed read transaction for ${storeName}`);
    };

    transaction.onerror = (event) => {
      console.error(
        `Error in read transaction for ${storeName}:`,
        event.target.error
      );
      reject(transaction.error);
    };

    try {
      const request = store.getAll();

      request.onsuccess = (event) => {
        const results = event.target.result;
        console.log(`Retrieved ${results.length} records from ${storeName}`);
        resolve(results);
      };

      request.onerror = (event) => {
        console.error(
          `Error getting data from ${storeName}:`,
          event.target.error
        );
        reject(request.error);
      };
    } catch (error) {
      console.error(`Exception while getting data from ${storeName}:`, error);
      reject(error);
    }
  });
};

// Generic function to update data in any store
export const updateInStore = async (db, storeName, key, data) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(data, key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Generic function to delete data from any store
export const deleteFromStore = async (db, storeName, key) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Generic function to clear all data from any store
export const clearStore = async (db, storeName) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
