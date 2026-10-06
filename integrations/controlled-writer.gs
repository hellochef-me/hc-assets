/* DISABLED SOURCE ONLY. Do not deploy/configure without an approved cutover.
 * One Apps Script project owns ALL writes. Old gateway and manual/API writers
 * must stop. ScriptLock protects this project across Next server instances;
 * it does NOT lock Google Sheets against collaborators or another script.
 * Required reviewed sidecar tabs: HCAssets_records(id,version,part,json),
 * HCAssets_movements(id,json), HCAssets_commands(requestId,digest,part,json).
 * Never creates tabs, changes existing headers or rewrites legacy history.
 * Advanced Sheets service must be enabled later. No configured properties here.
 */
function doPost(e) {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty("HC_ASSETS_GATEWAY_SECRET");
  var enabled = properties.getProperty("HC_ASSETS_WRITE_ENABLED") === "approved";
  var spreadsheetId = properties.getProperty("HC_ASSETS_SPREADSHEET_ID");
  if (!enabled || !secret || secret.length < 32 || !spreadsheetId) return jsonOutput({ error: "Gateway disabled" });
  var lock = LockService.getScriptLock();
  try {
    if (!e || !e.postData || e.postData.contents.length > 4000000) throw writerError("invalid", "Invalid request.");
    var envelope = JSON.parse(e.postData.contents);
    if (typeof envelope.payload !== "string" || !safeEqual(sign(envelope.payload, secret), envelope.signature)) throw writerError("invalid", "Invalid request signature.");
    var command = JSON.parse(envelope.payload);
    if (command.spreadsheetId !== spreadsheetId) throw writerError("configuration", "The gateway targets a different Sheet. No changes were made.");
    if (!command.issuedAt || Math.abs(Date.now() - Date.parse(command.issuedAt)) > 300000 || !Number.isFinite(Date.parse(command.issuedAt))) throw writerError("invalid", "Expired request.");
    if (!lock.tryLock(20000)) throw writerError("busy", "The writer is busy. Retry the same request ID.");
    var asset = commitCommand(command, spreadsheetId);
    return signedOutput({ ok: true, requestId: command.data.requestId, asset: asset }, secret);
  } catch (error) {
    return signedOutput({ ok: false, code: error.writerCode || "uncertain", message: error.writerCode ? error.message : "Write unconfirmed. Retry the same request ID and details." }, secret);
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
function writerError(code, message) { var error = new Error(message); error.writerCode = code; return error; }
function jsonOutput(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function signedOutput(value, secret) { var payload = JSON.stringify(value); return jsonOutput({ payload: payload, signature: sign(payload, secret) }); }
function sign(value, secret) { return Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8).map(function(b) { return (b & 255).toString(16).padStart(2, "0"); }).join(""); }
function hash(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function(b) { return (b & 255).toString(16).padStart(2, "0"); }).join(""); }
function safeEqual(a, b) { if (typeof b !== "string" || a.length !== b.length) return false; var diff = 0; for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function identity(value) { return String(value || "").trim().toLowerCase(); }
function table(values, expected) {
  if (!values || JSON.stringify(values[0]) !== JSON.stringify(expected)) throw writerError("configuration", "Sheet headers need review; no changes were made.");
  return values.slice(1);
}
function parts(rows, id, digest) {
  var matches = rows.filter(function(row) { return row[0] === id; });
  if (!matches.length) return null;
  matches.sort(function(a, b) { return Number(a[2]) - Number(b[2]); });
  if (matches.some(function(row, index) { return Number(row[2]) !== index || row[1] !== matches[0][1]; })) throw writerError("conflict", "Stored record parts require review.");
  if (digest && matches[0][1] !== digest) throw writerError("conflict", "This request ID was used for different details.");
  try { return JSON.parse(matches.map(function(row) { return row[3]; }).join("")); } catch (_) { throw writerError("conflict", "Stored record requires review."); }
}
function chunkRows(id, revision, object) {
  var text = JSON.stringify(object); var rows = [];
  for (var offset = 0; offset < text.length; offset += 44000) rows.push([id, String(revision), String(rows.length), text.slice(offset, offset + 44000)]);
  return rows;
}
function cells(values) { return values.map(function(value) { return { userEnteredValue: { stringValue: String(value === undefined || value === null ? "" : value) } }; }); }
function append(sheetId, rows) { return { appendCells: { sheetId: sheetId, rows: rows.map(function(row) { return { values: cells(row) }; }), fields: "userEnteredValue" } }; }
function update(sheetId, row, values) { return { updateCells: { start: { sheetId: sheetId, rowIndex: row, columnIndex: 0 }, rows: [{ values: cells(values) }], fields: "userEnteredValue" } }; }
function legacyAsset(raw) {
  var r = {}; INVENTORY_HEADERS.forEach(function(h, i) { r[h] = String(raw[i] || ""); });
  return { id: r.id, name: r.assetName || r.model || "Unnamed asset", category: ({ laptop: "Laptop", phone: "Phone", monitor: "Monitor", tablet: "Tablet", peripheral: "Peripheral" })[r.category.toLowerCase()] || "Other", brand: r.manufacturer, model: r.model, serial: r.serialNumber,
    specs: [r.cpu, r.ramGb ? r.ramGb + " GB RAM" : "", r.diskGb ? r.diskGb + " GB storage" : ""].filter(Boolean).join(" / "), condition: ({ new: "New", good: "Good", fair: "Fair", damaged: "Damaged" })[r.condition.toLowerCase()] || "Unknown", accessories: "", location: "", notes: r.notes, purchaseCost: r.purchasePrice, purchaseCurrency: r.purchaseCurrency, purchaseDate: r.purchaseDate, photos: [], serialChecked: false, specsChecked: false, conditionChecked: false, assignee: r.assignedTo, status: ({ in_use: "Assigned", spare: "Available", retired: "Retired", repair: "Repair" })[r.status.toLowerCase()] || "Needs review", version: 1, createdAt: r.createdAt, updatedAt: r.updatedAt, raw: r };
}
var INVENTORY_HEADERS = ["id", "category", "assetName", "manufacturer", "model", "serialNumber", "cpu", "ramGb", "diskGb", "modelYear", "purchasePrice", "purchaseCurrency", "purchaseDate", "condition", "assignedTo", "status", "notes", "createdAt", "updatedAt"];
var HISTORY_HEADERS = ["id", "assetId", "assetName", "serialNumber", "fromAssignedTo", "toAssignedTo", "changedAt", "changedBy", "source"];
function commitCommand(command, spreadsheetId) {
  var d = command.data; var action = command.action;
  if (!d || !/^[a-f0-9-]{36}$/i.test(d.requestId) || ["create", "edit", "move"].indexOf(action) < 0 || typeof command.actor !== "string" || !command.actor.trim() || command.actor.length > 200) throw writerError("invalid", "Invalid command.");
  var digest = hash(JSON.stringify({ spreadsheetId: command.spreadsheetId, action: action, data: d, actor: command.actor, assetId: command.assetId || "" }));
  var tabs = ["Inventory", "assignment_history", "Employees", "HCAssets_records", "HCAssets_movements", "HCAssets_commands"];
  var values = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, { ranges: tabs.map(function(t) { return "'" + t + "'!A:ZZ"; }), valueRenderOption: "FORMATTED_VALUE" }).valueRanges;
  if (!values || values.length !== tabs.length) throw writerError("configuration", "Required Sheet tabs are missing.");
  var inventory = table(values[0].values, INVENTORY_HEADERS); table(values[1].values, HISTORY_HEADERS);
  var state = table(values[3].values, ["id", "version", "part", "json"]); table(values[4].values, ["id", "json"]);
  var receipts = table(values[5].values, ["requestId", "digest", "part", "json"]);
  var receipt = parts(receipts, d.requestId, digest);
  if (receipt) {
    if (receipt.state === "committed" && receipt.asset) return receipt.asset;
    throw writerError("uncertain", "A prior write is still unconfirmed. Reconciliation is required before replay.");
  }
  // A possibly in-flight asset batch can race ANY later command, including one
  // using a different UUID but the same serial. Freeze this writer globally.
  var commandIds = {};
  receipts.forEach(function(row) { if (row[0]) commandIds[row[0]] = true; });
  Object.keys(commandIds).forEach(function(id) {
    var savedCommand = parts(receipts, id);
    if (!savedCommand || savedCommand.state !== "committed") throw writerError("uncertain", "An earlier write is unconfirmed. The writer is paused for reconciliation.");
  });
  var ids = {}; inventory.forEach(function(row) { if (!row.some(Boolean)) return; if (!row[0] || ids[row[0]]) throw writerError("conflict", "Inventory IDs need review."); ids[row[0]] = true; });
  var index = inventory.findIndex(function(row) { return row[0] === command.assetId; });
  var before = index >= 0 ? legacyAsset(inventory[index]) : null;
  if (before) { var saved = parts(state, before.id); if (saved) { if (saved.fingerprint !== hash(JSON.stringify(inventory[index]))) throw writerError("conflict", "The Sheet was edited outside the controlled writer. Review required."); before = saved.asset; } }
  if (action !== "create" && !before) throw writerError("conflict", "Asset no longer exists.");
  if (action !== "create" && before.version !== d.expectedVersion) throw writerError("conflict", "Asset changed. Reload before saving.");
  if (before && before.status === "Retired" && action === "move") throw writerError("invalid", "Retired assets cannot be moved.");
  var now = new Date().toISOString(); var after;
  if (action === "create" || action === "edit") {
    validateAsset(d.asset);
    after = Object.assign({}, before || {}, d.asset, { id: before ? before.id : Utilities.getUuid(), assignee: before ? before.assignee : "", status: before && (before.status === "Retired" || before.status === "Repair") ? before.status : before && before.assignee ? "Assigned" : (!d.asset.serial || !d.asset.specs || d.asset.condition === "Unknown" ? "Needs review" : "Available"), createdAt: before ? before.createdAt : now, updatedAt: now, version: before ? before.version + 1 : 1 });
    if (after.serial && inventory.some(function(row) { return row[0] !== after.id && identity(row[5]) === identity(after.serial); })) throw writerError("duplicate", "This serial already exists. Open the existing asset.");
  } else {
    if (["Assign", "Transfer", "Return", "Repair", "Retire"].indexOf(d.action) < 0 || typeof d.location !== "string" || !d.location.trim() || typeof d.notes !== "string" || d.notes.length > 2000 || typeof d.assignee !== "string") throw writerError("invalid", "Invalid movement.");
    var assigned = d.action === "Assign" || d.action === "Transfer";
    if (assigned && !d.assignee.trim()) throw writerError("invalid", "Choose a person.");
    if (assigned && !(values[2].values || []).slice(1).some(function(row) { return row[0] === d.assignee; })) throw writerError("invalid", "Person no longer exists.");
    if ((d.action === "Assign" && before.assignee) || ((d.action === "Transfer" || d.action === "Return") && !before.assignee)) throw writerError("conflict", "Assignment changed. Reload the asset.");
    after = Object.assign({}, before, { assignee: assigned ? d.assignee : "", location: d.location, status: d.action === "Repair" ? "Repair" : d.action === "Retire" ? "Retired" : assigned ? "Assigned" : (!before.serial || !before.specs || before.condition === "Unknown" ? "Needs review" : "Available"), version: before.version + 1, updatedAt: now });
  }
  var row = before ? inventory[index].slice() : INVENTORY_HEADERS.map(function() { return ""; });
  var projections = { id: after.id, category: after.category.toLowerCase(), assetName: after.name, manufacturer: after.brand, model: after.model, serialNumber: after.serial, condition: after.condition === "Unknown" ? "" : after.condition.toLowerCase(), assignedTo: after.assignee, status: ({ Assigned: "in_use", Available: "spare", Repair: "repair", Retired: "retired", "Needs review": "needs_review" })[after.status], notes: after.notes, purchasePrice: after.purchaseCost, purchaseCurrency: after.purchaseCurrency, purchaseDate: after.purchaseDate, createdAt: after.createdAt, updatedAt: now };
  // No CPU/RAM/disk/modelYear guesses. Unmapped legacy columns remain byte-for-byte.
  Object.keys(projections).forEach(function(h) {
    var column = INVENTORY_HEADERS.indexOf(h);
    var unchanged = before && ({ category: "category", assetName: "name", manufacturer: "brand", model: "model", serialNumber: "serial", condition: "condition", assignedTo: "assignee", status: "status", notes: "notes", purchasePrice: "purchaseCost", purchaseCurrency: "purchaseCurrency", purchaseDate: "purchaseDate", createdAt: "createdAt" })[h];
    if (unchanged && before[unchanged] === after[unchanged]) return;
    row[column] = projections[h];
  });
  var movement = { id: Utilities.getUuid(), assetId: after.id, action: action === "create" ? "Created" : action === "edit" ? "Edited" : d.action, actor: command.actor, at: now, from: { assignee: before ? before.assignee : "", location: before ? before.location : "", status: before ? before.status : "" }, to: { assignee: after.assignee, location: after.location, status: after.status }, notes: action === "move" ? d.notes : after.notes };
  var properties = Sheets.Spreadsheets.get(spreadsheetId, { fields: "sheets.properties" }).sheets;
  var sheetIds = {}; properties.forEach(function(sheet) { sheetIds[sheet.properties.title] = sheet.properties.sheetId; });
  if (tabs.some(function(t) { return sheetIds[t] === undefined; })) throw writerError("configuration", "Required Sheet tabs are missing.");
  var requests = [before ? update(sheetIds.Inventory, index + 1, row) : append(sheetIds.Inventory, [row])];
  state.forEach(function(r, i) { if (r[0] === after.id) requests.push(update(sheetIds.HCAssets_records, i + 1, ["", "", "", ""])); });
  requests.push(append(sheetIds.HCAssets_records, chunkRows(after.id, after.version, { asset: after, fingerprint: hash(JSON.stringify(row)) })));
  requests.push(append(sheetIds.HCAssets_movements, [[movement.id, JSON.stringify(movement)]]));
  requests.push(append(sheetIds.assignment_history, [[movement.id, after.id, after.name, after.serial, movement.from.assignee, after.assignee, now, command.actor, movement.action]]));
  // Reserve intent DURABLY before submitting the asset batch. A terminated script
  // may release ScriptLock while an upstream request is still in flight. A retry
  // seeing pending must NEVER resubmit: Sheets has no conditional write/fencing.
  // Ambiguous intent acknowledgement also stops before any asset submission.
  Sheets.Spreadsheets.batchUpdate({ requests: [append(sheetIds.HCAssets_commands, [[d.requestId, digest, "0", JSON.stringify({ state: "pending", startedAt: now })]])] }, spreadsheetId);
  // The intent was appended at the next row. Only this script project may write.
  requests.push(update(sheetIds.HCAssets_commands, receipts.length + 1, ["", "", "", ""]));
  requests.push(append(sheetIds.HCAssets_commands, chunkRows(d.requestId, digest, { state: "committed", asset: after })));
  // Inventory, full movement, legacy event and durable receipt apply together.
  // A lost response is uncertain: the SAME command reads a committed receipt,
  // otherwise a pending intent blocks until an approved reconciliation.
  Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
  return after;
}
function validateAsset(a) {
  if (!a || typeof a.name !== "string" || !a.name.trim() || typeof a.location !== "string" || !a.location.trim() || ["Laptop", "Phone", "Tablet", "Monitor", "Peripheral", "Other"].indexOf(a.category) < 0 || ["Unknown", "New", "Good", "Fair", "Damaged"].indexOf(a.condition) < 0) throw writerError("invalid", "Invalid asset.");
  ["name", "location", "brand", "model", "serial", "specs", "accessories"].forEach(function(k) { if (typeof a[k] !== "string" || a[k].length > 400) throw writerError("invalid", "Invalid asset field."); });
  if (typeof a.notes !== "string" || a.notes.length > 2000 || !Array.isArray(a.photos) || a.photos.length > 3 || a.photos.some(function(p) { return typeof p !== "string" || p.length > 900000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p); })) throw writerError("invalid", "Invalid asset evidence.");
  if (typeof a.purchaseCost !== "string" || !/^$|^\d{1,9}(\.\d{1,2})?$/.test(a.purchaseCost) || typeof a.purchaseCurrency !== "string" || a.purchaseCurrency.length > 10 || typeof a.purchaseDate !== "string" || !/^$|^\d{4}-\d{2}-\d{2}$/.test(a.purchaseDate)) throw writerError("invalid", "Invalid purchase evidence.");
  if ((a.serial && !a.serialChecked) || (a.specs && !a.specsChecked) || (a.condition !== "Unknown" && !a.conditionChecked)) throw writerError("invalid", "Human review is required.");
}
