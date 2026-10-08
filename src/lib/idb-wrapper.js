/*
 * Minimal IndexedDB wrapper (vendored, no CDN, no third-party code — see DECISIONS.md D-002).
 *
 * Why not a library: we need one object store and three operations. The wrapper is small
 * enough to audit in a minute.
 *
 * Why the connection is cached: opening a database on every call is slow, and an MV3 service
 * worker can be terminated and restarted at any time. A failed open clears the cache so the
 * next call retries cleanly instead of replaying a dead promise forever.
 */
(function (g) {
  'use strict';
  const NS = (g.SkinShift = g.SkinShift || {});

  function openDb(name, version, storeName) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-open-failed'));
      req.onblocked = () => reject(new Error('idb-blocked'));
    });
  }

  // Resolves on transaction completion, not request success: a request can succeed and the
  // transaction still abort, and writes are only durable once the transaction commits.
  function run(db, storeName, mode, makeRequest) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = makeRequest(tx.objectStore(storeName));
      let result;
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('idb-tx-failed'));
      tx.onabort = () => reject(tx.error || new Error('idb-tx-aborted'));
    });
  }

  class Store {
    constructor(opts) {
      this.name = opts.name;
      this.version = opts.version;
      this.storeName = opts.store;
      this._dbPromise = null;
    }

    _db() {
      if (!this._dbPromise) {
        this._dbPromise = openDb(this.name, this.version, this.storeName).catch((err) => {
          this._dbPromise = null; // allow retry on the next call
          throw err;
        });
      }
      return this._dbPromise;
    }

    async get(key) {
      const db = await this._db();
      return run(db, this.storeName, 'readonly', (s) => s.get(key));
    }

    async put(key, value) {
      const db = await this._db();
      return run(db, this.storeName, 'readwrite', (s) => s.put(value, key));
    }

    async delete(key) {
      const db = await this._db();
      return run(db, this.storeName, 'readwrite', (s) => s.delete(key));
    }
  }

  NS.createIDBStore = function createIDBStore(opts) {
    return new Store(opts);
  };
})(typeof self !== 'undefined' ? self : window);
