/**
 * Generador de suplencias · Escuelas San José
 * Aplicación web vinculada a la hoja original.
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1UaNLLEtzU-fTOA8boGkJwAk7hCQUsgo5NieB8mel_iY',
  ALLOWED_DOMAIN: 'escuelassj.com',
  // Si se añaden correos, solo podrán entrar esas personas del dominio.
  // Ejemplo: ['direccion.primaria@escuelassj.com']
  ALLOWED_EMAILS: [],
  SHEETS: {
    EVENTS: 'Eventos',
    DATA: 'Datos',
    SCHEDULE: 'Horario',
  },
  EVENT_START_ROW: 3,
  EVENT_COLUMNS: 22,
  LOCALE: 'es-ES',
  TIME_ZONE: 'Europe/Madrid',
});

function doGet() {
  try {
    const user = requireSchoolUser_();
    const template = HtmlService.createTemplateFromFile('Index');
    template.userEmail = user.email;
    return template
      .evaluate()
      .setTitle('Generador de suplencias')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  } catch (error) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Acceso restringido</title><style>' +
      'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f8f9;color:#424642;font-family:Arial,sans-serif}' +
      'main{max-width:520px;margin:24px;padding:42px;border:1px solid #d8e7eb;border-radius:24px;background:#fff;box-shadow:0 22px 60px #1f59670f}' +
      'b{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#009dc2;color:white;font-family:Georgia,serif;font-size:24px}' +
      'h1{font:500 34px Georgia,serif;margin:24px 0 12px}p{color:#697374;line-height:1.65}code{color:#007d9a}</style></head>' +
      '<body><main><b>S</b><h1>Acceso restringido</h1><p>Esta aplicación solo está disponible para cuentas corporativas <code>@' +
      escapeHtml_(CONFIG.ALLOWED_DOMAIN) +
      '</code>. Cierra la sesión de otras cuentas de Google y vuelve a abrir el enlace con tu cuenta del centro.</p></main></body></html>'
    );
  }
}

/** Devuelve toda la información necesaria para iniciar la interfaz. */
function getBootstrapData() {
  const user = requireSchoolUser_();
  const spreadsheet = getSpreadsheet_();

  return {
    user: user,
    teachers: readTeachers_(spreadsheet),
    spaces: readSpaces_(spreadsheet),
    timeSlots: readTimeSlots_(spreadsheet),
    substitutions: readSubstitutions_(spreadsheet),
    today: Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd'),
    spreadsheetUrl: spreadsheet.getUrl(),
  };
}

/** Comprobación segura de instalación: no modifica ni envía información. */
function runSelfCheck() {
  const user = requireSchoolUser_();
  const spreadsheet = getSpreadsheet_();
  const requiredSheets = [CONFIG.SHEETS.EVENTS, CONFIG.SHEETS.DATA, CONFIG.SHEETS.SCHEDULE];
  requiredSheets.forEach(function (name) {
    if (!spreadsheet.getSheetByName(name)) throw new Error('Falta la pestaña "' + name + '".');
  });
  const teachers = readTeachers_(spreadsheet);
  const spaces = readSpaces_(spreadsheet);
  const timeSlots = readTimeSlots_(spreadsheet);
  if (!teachers.length) throw new Error('No hay docentes con correo válido en la pestaña Datos.');
  if (!spaces.length) throw new Error('No hay espacios en la columna G de Datos.');
  if (!timeSlots.length) throw new Error('No hay franjas válidas en Horario.');
  return {
    ok: true,
    user: user.email,
    spreadsheet: spreadsheet.getName(),
    teachers: teachers.length,
    spaces: spaces.length,
    timeSlots: timeSlots.length,
  };
}

/** Guarda una suplencia y, si se solicita, envía el aviso y crea el evento. */
function createSubstitution(payload) {
  const user = requireSchoolUser_();
  const data = validatePayload_(payload);
  const spreadsheet = getSpreadsheet_();
  const teachers = readTeachers_(spreadsheet);
  const substitute = teachers.find(function (teacher) { return teacher.id === data.substituteId; });
  const absent = teachers.find(function (teacher) { return teacher.id === data.absentId; });

  if (!substitute || !absent) {
    throw new Error('No se han encontrado las personas seleccionadas en la hoja Datos.');
  }

  const existing = readSubstitutions_(spreadsheet);
  const conflict = existing.find(function (item) {
    return item.date === data.date && item.start === data.start && item.substituteId === substitute.id;
  });
  if (conflict && !data.allowConflict) {
    throw new Error(substitute.name + ' ya tiene una suplencia a las ' + data.start + ' en ' + conflict.space + '.');
  }

  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.EVENTS);
  const rowNumber = firstEmptyEventRow_(sheet);
  const dateParts = data.date.split('-').map(Number);
  const displayDate = formatSpanishDate_(data.date);
  const subject = 'Sustitución de ' + absent.name + ' el ' + dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0] + ' a las ' + data.start + ' h.';
  const title = 'Sustitución de ' + absent.name + ' por ' + substitute.name;
  const plainMessage = buildPlainMessage_(substitute, absent, data, displayDate);
  const htmlMessage = buildHtmlMessage_(substitute, absent, data, displayDate);
  const createdAt = new Date();
  const calendarColor = data.absenceType === 'Laboral' ? '10' : '11';

  const values = [[
    dateParts[2],
    dateParts[1],
    dateParts[0],
    data.start,
    data.end,
    title,
    data.space,
    data.absenceType,
    data.substitutionType,
    substitute.sourceName,
    absent.sourceName,
    substitute.firstName,
    absent.name,
    substitute.email,
    absent.email,
    [substitute.email, absent.email].filter(Boolean).join(', '),
    data.task,
    calendarColor,
    createdAt,
    spanishMonth_(dateParts[1]),
    absent.name,
    subject,
  ]];

  sheet.getRange(rowNumber, 1, 1, CONFIG.EVENT_COLUMNS).setValues(values);
  sheet.getRange(rowNumber, 19).setNumberFormat('dd/MM/yyyy HH:mm');

  const result = {
    ok: true,
    rowNumber: rowNumber,
    emailSent: false,
    calendarCreated: false,
    warnings: [],
    createdBy: user.email,
  };

  if (data.sendEmail) {
    try {
      const options = {
        htmlBody: htmlMessage,
        name: 'Gestión de suplencias',
      };
      if (absent.email && absent.email !== substitute.email) options.cc = absent.email;
      GmailApp.sendEmail(substitute.email, subject, plainMessage, options);
      result.emailSent = true;
    } catch (error) {
      result.warnings.push('La suplencia se guardó, pero no se pudo enviar el correo: ' + error.message);
    }
  }

  if (data.createCalendar) {
    try {
      const startDate = dateTime_(data.date, data.start);
      const endDate = dateTime_(data.date, data.end);
      const calendar = getTargetCalendar_(sheet);
      const event = calendar.createEvent(title, startDate, endDate, {
        description: plainMessage,
        location: data.space,
        guests: substitute.email,
        sendInvites: false,
      });
      event.setColor(calendarColor);
      sheet.getRange(rowNumber, 1).setNote('calendarEventId=' + event.getId());
      result.calendarCreated = true;
    } catch (error) {
      result.warnings.push('La suplencia se guardó, pero no se pudo crear el evento: ' + error.message);
    }
  }

  SpreadsheetApp.flush();
  return result;
}

/** Elimina el registro y, si existe, su evento de calendario asociado. */
function deleteSubstitution(rowNumber) {
  requireSchoolUser_();
  const row = Number(rowNumber);
  if (!Number.isInteger(row) || row < CONFIG.EVENT_START_ROW) throw new Error('Registro no válido.');

  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.EVENTS);
  const cell = sheet.getRange(row, 1);
  const note = cell.getNote() || '';
  const match = note.match(/calendarEventId=(.+)/);

  if (match) {
    try {
      const calendar = getTargetCalendar_(sheet);
      const event = calendar.getEventById(match[1]);
      if (event) event.deleteEvent();
    } catch (error) {
      // El registro debe poder eliminarse aunque el evento ya no exista.
    }
  }

  sheet.getRange(row, 1, 1, CONFIG.EVENT_COLUMNS).clearContent().clearNote();
  SpreadsheetApp.flush();
  return { ok: true };
}

/** Añade una persona a la hoja Datos sin sobrescribir los espacios existentes. */
function addTeacher(input) {
  requireSchoolUser_();
  const name = cleanText_(input && input.name, 120);
  const email = cleanText_(input && input.email, 160).toLowerCase();
  if (!name || !isEmail_(email)) throw new Error('Introduce un nombre y un correo válidos.');

  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.DATA);
  const current = readTeachers_(spreadsheet);
  if (current.some(function (teacher) { return teacher.email.toLowerCase() === email; })) {
    throw new Error('Ese correo ya está en la lista de docentes.');
  }

  const row = firstEmptyRowInColumn_(sheet, 1, 2);
  const firstName = name.split(/\s+/)[0];
  sheet.getRange(row, 1).setValue(name);
  sheet.getRange(row, 2).setValue(email);
  sheet.getRange(row, 5).setValue(firstName);
  sheet.getRange(row, 6).setValue(name);
  SpreadsheetApp.flush();
  return { ok: true, teacher: { id: email, name: name, firstName: firstName, email: email } };
}

/** Añade un aula o espacio a la columna G de Datos. */
function addSpace(input) {
  requireSchoolUser_();
  const name = cleanText_(input && input.name, 100);
  if (!name) throw new Error('Introduce el nombre del espacio.');

  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.DATA);
  const current = readSpaces_(spreadsheet);
  if (current.some(function (space) { return space.toLowerCase() === name.toLowerCase(); })) {
    throw new Error('Ese espacio ya existe.');
  }

  const row = firstEmptyRowInColumn_(sheet, 7, 2);
  sheet.getRange(row, 7).setValue(name);
  SpreadsheetApp.flush();
  return { ok: true, space: name };
}

function requireSchoolUser_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    throw new Error('No se ha podido identificar tu cuenta. Abre la aplicación con tu cuenta corporativa.');
  }

  const domain = email.split('@')[1] || '';
  if (domain !== CONFIG.ALLOWED_DOMAIN.toLowerCase()) {
    throw new Error('Acceso permitido únicamente a cuentas @' + CONFIG.ALLOWED_DOMAIN + '.');
  }

  const allowlist = CONFIG.ALLOWED_EMAILS.map(function (value) { return value.toLowerCase(); });
  if (allowlist.length && allowlist.indexOf(email) === -1) {
    throw new Error('Tu cuenta pertenece al dominio, pero no está autorizada para usar esta aplicación.');
  }

  return { email: email, name: email.split('@')[0] };
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function readTeachers_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.DATA);
  if (!sheet) throw new Error('No existe la hoja "' + CONFIG.SHEETS.DATA + '".');
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const rows = sheet.getRange(2, 1, lastRow - 1, 6).getDisplayValues();
  const seen = {};

  return rows.reduce(function (teachers, row) {
    const sourceName = String(row[0] || '').trim();
    const email = String(row[1] || '').trim().toLowerCase();
    if (!sourceName || !isEmail_(email) || seen[email]) return teachers;
    seen[email] = true;
    const name = String(row[5] || '').trim() || sourceName;
    const firstName = String(row[4] || '').trim() || name.split(/\s+/)[0];
    teachers.push({ id: email, sourceName: sourceName, name: name, firstName: firstName, email: email });
    return teachers;
  }, []).sort(function (a, b) { return a.name.localeCompare(b.name, CONFIG.LOCALE); });
}

function readSpaces_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.DATA);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const values = sheet.getRange(2, 7, lastRow - 1, 1).getDisplayValues();
  const seen = {};
  return values.map(function (row) { return String(row[0] || '').trim(); })
    .filter(function (value) {
      const key = value.toLowerCase();
      if (!value || seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function readTimeSlots_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.SCHEDULE);
  if (!sheet) throw new Error('No existe la hoja "' + CONFIG.SHEETS.SCHEDULE + '".');
  const lastRow = Math.max(sheet.getLastRow(), 2);
  return sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues()
    .filter(function (row) { return row[0] && row[1]; })
    .map(function (row) { return { start: normalizeTime_(row[0]), end: normalizeTime_(row[1]) }; });
}

function readSubstitutions_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.EVENTS);
  if (!sheet) throw new Error('No existe la hoja "' + CONFIG.SHEETS.EVENTS + '".');
  const lastRow = Math.max(sheet.getLastRow(), CONFIG.EVENT_START_ROW);
  const count = lastRow - CONFIG.EVENT_START_ROW + 1;
  const rows = sheet.getRange(CONFIG.EVENT_START_ROW, 1, count, CONFIG.EVENT_COLUMNS).getDisplayValues();
  const notes = sheet.getRange(CONFIG.EVENT_START_ROW, 1, count, 1).getNotes();
  const teachers = readTeachers_(spreadsheet);
  const teacherBySource = {};
  teachers.forEach(function (teacher) { teacherBySource[teacher.sourceName] = teacher; });

  return rows.reduce(function (items, row, index) {
    const day = Number(row[0]);
    const month = Number(row[1]);
    const year = Number(row[2]);
    if (!day || !month || !year) return items;

    const substitute = teacherBySource[String(row[9] || '').trim()];
    const absent = teacherBySource[String(row[10] || '').trim()];
    items.push({
      rowNumber: CONFIG.EVENT_START_ROW + index,
      date: [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-'),
      start: normalizeTime_(row[3]),
      end: normalizeTime_(row[4]),
      title: String(row[5] || ''),
      space: String(row[6] || ''),
      absenceType: String(row[7] || 'Laboral'),
      substitutionType: String(row[8] || ''),
      substituteId: substitute ? substitute.id : String(row[13] || '').trim().toLowerCase(),
      substituteName: substitute ? substitute.name : String(row[11] || row[9] || ''),
      absentId: absent ? absent.id : String(row[14] || '').trim().toLowerCase(),
      absentName: absent ? absent.name : String(row[12] || row[10] || ''),
      task: String(row[16] || ''),
      hasCalendarEvent: /^calendarEventId=/.test(notes[index][0] || ''),
    });
    return items;
  }, []).sort(function (a, b) {
    return (b.date + ' ' + b.start).localeCompare(a.date + ' ' + a.start);
  });
}

function validatePayload_(payload) {
  const input = payload || {};
  const date = cleanText_(input.date, 10);
  const start = normalizeTime_(input.start);
  const end = normalizeTime_(input.end);
  const space = cleanText_(input.space, 100);
  const absenceType = cleanText_(input.absenceType, 20);
  const substitutionType = cleanText_(input.substitutionType, 60);
  const substituteId = cleanText_(input.substituteId, 180).toLowerCase();
  const absentId = cleanText_(input.absentId, 180).toLowerCase();
  const task = cleanText_(input.task, 1200);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Selecciona una fecha válida.');
  if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) throw new Error('Selecciona una franja horaria válida.');
  if (!space || !substituteId || !absentId) throw new Error('Completa el espacio y las personas implicadas.');
  if (['Laboral', 'Personal'].indexOf(absenceType) === -1) throw new Error('Tipo de ausencia no válido.');
  if (['Ordinaria Guardia', 'Ordinaria Liberada', 'No ordinaria'].indexOf(substitutionType) === -1) {
    throw new Error('Modalidad de suplencia no válida.');
  }
  if (substituteId === absentId) throw new Error('La persona ausente y quien sustituye deben ser diferentes.');

  return {
    date: date,
    start: start,
    end: end,
    space: space,
    absenceType: absenceType,
    substitutionType: substitutionType,
    substituteId: substituteId,
    absentId: absentId,
    task: task,
    sendEmail: Boolean(input.sendEmail),
    createCalendar: Boolean(input.createCalendar),
    allowConflict: Boolean(input.allowConflict),
  };
}

function firstEmptyEventRow_(sheet) {
  const maxRows = sheet.getMaxRows();
  const count = maxRows - CONFIG.EVENT_START_ROW + 1;
  const values = sheet.getRange(CONFIG.EVENT_START_ROW, 1, count, 1).getDisplayValues();
  for (let index = 0; index < values.length; index += 1) {
    if (!String(values[index][0] || '').trim()) return CONFIG.EVENT_START_ROW + index;
  }
  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

function firstEmptyRowInColumn_(sheet, column, startRow) {
  const maxRows = sheet.getMaxRows();
  const count = maxRows - startRow + 1;
  const values = sheet.getRange(startRow, column, count, 1).getDisplayValues();
  for (let index = 0; index < values.length; index += 1) {
    if (!String(values[index][0] || '').trim()) return startRow + index;
  }
  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

function getTargetCalendar_(eventSheet) {
  const configuredId = String(eventSheet.getRange('B1').getDisplayValue() || '').trim();
  if (configuredId) {
    const calendar = CalendarApp.getCalendarById(configuredId);
    if (calendar) return calendar;
  }
  return CalendarApp.getDefaultCalendar();
}

function dateTime_(date, time) {
  const dateParts = date.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], 0, 0);
}

function buildPlainMessage_(substitute, absent, data, displayDate) {
  let body = 'Hola ' + substitute.firstName + ',\n\n' +
    'Sustituye a ' + absent.name + ' en ' + data.space + ' el ' + displayDate + ' a las ' + data.start + ' horas.\n\n';
  body += data.task
    ? 'La tarea a realizar es: ' + data.task
    : 'En breve, la persona a la que sustituyes te indicará las tareas a llevar a cabo. Para cualquier duda, ponte en contacto con esa persona.';
  return body + '\n\nUn saludo.';
}

function buildHtmlMessage_(substitute, absent, data, displayDate) {
  const task = data.task
    ? '<p>La tarea a realizar es: <strong>' + escapeHtml_(data.task) + '</strong></p>'
    : '<p>En breve, la persona a la que sustituyes te indicará las tareas a llevar a cabo. Para cualquier duda, ponte en contacto con esa persona.</p>';
  return '<p>Hola ' + escapeHtml_(substitute.firstName) + ',</p>' +
    '<p>Sustituye a <strong>' + escapeHtml_(absent.name) + '</strong> en <strong>' + escapeHtml_(data.space) +
    '</strong> el ' + escapeHtml_(displayDate) + ' a las <strong>' + escapeHtml_(data.start) + '</strong> horas.</p>' +
    task + '<p>Un saludo.</p>';
}

function formatSpanishDate_(isoDate) {
  const date = new Date(isoDate + 'T12:00:00');
  return Utilities.formatDate(date, CONFIG.TIME_ZONE, 'd') + ' de ' + spanishMonth_(date.getMonth() + 1) + ' de ' + Utilities.formatDate(date, CONFIG.TIME_ZONE, 'yyyy');
}

function spanishMonth_(month) {
  return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(month) - 1] || '';
}

function normalizeTime_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) + ':' + match[2] : text;
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
