/**
 * Google Apps Script — Sheet CRUD for Hello Chef Asset Inventory
 *
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone (or Anyone within org)
 *
 * Script Properties (set via Project Settings > Script Properties):
 *   SPREADSHEET_ID — the spreadsheet ID (optional if bound to a sheet)
 */

var SHEET_NAME = 'inventory';

var HEADERS = [
  'id', 'category', 'assetName', 'manufacturer', 'model', 'serialNumber',
  'cpu', 'ramGb', 'diskGb', 'modelYear',
  'purchasePrice', 'purchaseCurrency', 'purchaseDate', 'condition',
  'assignedTo', 'status', 'notes', 'createdAt', 'updatedAt'
];

function getSheet_() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';

    if (action === 'employees') {
      return getEmployees_();
    }

    var sheet = getSheet_();
    var data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = data[0];
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[headers[j]] = data[i][j] !== undefined ? String(data[i][j]) : '';
      }
      rows.push(obj);
    }

    return ContentService.createTextOutput(JSON.stringify(rows))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getEmployees_() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employees');
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0] || '').trim();
    var department = String(data[i][1] || '').trim();
    if (name) {
      rows.push({ name: name, department: department });
    }
  }

  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var sheet = getSheet_();
    var payload = JSON.parse(e.postData.contents);

    if (payload.mode === 'delete' && payload.id) {
      return deleteRow_(sheet, payload.id);
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf('id');

    var existingRow = -1;
    if (payload.id && idCol >= 0) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(payload.id)) {
          existingRow = i + 1;
          break;
        }
      }
    }

    var now = new Date().toISOString();
    if (!payload.createdAt) payload.createdAt = now;
    payload.updatedAt = now;

    var row = [];
    for (var j = 0; j < headers.length; j++) {
      row.push(payload[headers[j]] !== undefined ? payload[headers[j]] : '');
    }

    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, id: payload.id }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function deleteRow_(sheet, id) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('id');

  if (idCol < 0) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'id column not found' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return ContentService.createTextOutput(JSON.stringify({ success: true, id: id }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ error: 'Row not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * One-time helper: run manually to create the header row if needed.
 */
function setupHeaders() {
  var sheet = getSheet_();
  var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (String(existing[0]) !== 'id') {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}
