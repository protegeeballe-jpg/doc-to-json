const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const outputArea = document.getElementById('output');
const downloadBtn = document.getElementById('downloadBtn');
const downloadReportBtn = document.getElementById('downloadReportBtn');
const copyBtn = document.getElementById('copyBtn');
const statusDiv = document.getElementById('status');
const fileInfo = document.getElementById('fileInfo');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const preserveStringsCheckbox = document.getElementById('preserveStrings');

// Phase 4 UI Elements
const enableBibleModeCheckbox = document.getElementById('enableBibleMode');
const bibleTranslationInput = document.getElementById('bibleTranslation');
const bibleLanguageSelect = document.getElementById('bibleLanguage');
const stripFootnotesCheckbox = document.getElementById('stripFootnotes');
const runValidationCheckbox = document.getElementById('runValidation');

// Phase 5 OCR UI Elements
const enableOcrCheckbox = document.getElementById('enableOcr');
const ocrLanguageSelect = document.getElementById('ocrLanguage');
const forceOcrAllCheckbox = document.getElementById('forceOcrAll');

// Phase 6 Table Intelligence UI Elements
const enableTableIntelligenceCheckbox = document.getElementById('enableTableIntelligence');
const spreadsheetStructureSelect = document.getElementById('spreadsheetStructure');
const extractFormulasCheckbox = document.getElementById('extractFormulas');
const detectPdfTablesCheckbox = document.getElementById('detectPdfTables');

// Phase 7 Security Limits
const MAX_FILE_SIZE_MB = 50;
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'json', 'csv', 'xlsx', 'xls'];

let jsonString = '';
let reportString = '';

// Configure worker for PDF.js using the global version
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-indigo-400', 'bg-slate-800/80');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-indigo-400', 'bg-slate-800/80');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-400', 'bg-slate-800/80');
    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFile({ target: fileInput });
    }
});

fileInput.addEventListener('change', handleFile);

// Universal Main File Router with Phase 7 Security Guards
async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileExt = fileName.split('.').pop().toLowerCase();
    const fileSizeMB = file.size / (1024 * 1024);

    // 1. Phase 7 File Size Cap Safeguard
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
        alert(`Security Error: File size (${fileSizeMB.toFixed(2)} MB) exceeds the maximum allowed limit of ${MAX_FILE_SIZE_MB} MB.`);
        fileInput.value = '';
        return;
    }

    // 2. Phase 7 Extension Safeguard
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        alert(`Security Error: Unsupported or non-permitted file format (.${fileExt}).`);
        fileInput.value = '';
        return;
    }

    fileInfo.textContent = `Selected File: ${fileName} (${fileSizeMB.toFixed(2)} MB) [Local Sandbox]`;
    progressContainer.classList.remove('hidden');
    downloadReportBtn.style.display = 'none';
    updateProgress(10, `Routing secure parser for .${fileExt} file...`);

    try {
        let resultObject = null;
        const isBibleMode = enableBibleModeCheckbox && enableBibleModeCheckbox.checked;

        if (fileExt === 'pdf') {
            const rawPdfData = await parsePDF(file);
            resultObject = isBibleMode ? await processBibleData(rawPdfData, file.name) : rawPdfData;
        } else if (fileExt === 'txt') {
            const rawTxtData = await parseTXT(file);
            resultObject = isBibleMode ? await processBibleData(rawTxtData, file.name) : rawTxtData;
        } else if (fileExt === 'json') {
            resultObject = await parseJSONFile(file);
        } else if (fileExt === 'csv' || fileExt === 'xlsx' || fileExt === 'xls') {
            resultObject = await parseSpreadsheet(file, fileExt);
        } else {
            throw new Error(`File format strictly not permitted.`);
        }

        jsonString = JSON.stringify(resultObject, null, 2);
        outputArea.value = jsonString;
        downloadBtn.style.display = 'inline-flex';

        updateProgress(100, 'Secure conversion complete!');
        statusDiv.textContent = isBibleMode 
            ? `Successfully converted Bible document to structured canon JSON!`
            : `Successfully parsed .${fileExt} document securely!`;

    } catch (error) {
        console.error('Phase 7 Exception Sandbox:', error);
        statusDiv.textContent = `Processing halted due to malformed file structure.`;
        alert(`Failed to parse file: The document appears to be corrupted or unreadable.`);
    } finally {
        setTimeout(() => progressContainer.classList.add('hidden'), 2500);
    }
}

// -------------------------------------------------------------
// Parser 1: PDF Parser with Phase 5 OCR & Phase 6 Table Detection
// -------------------------------------------------------------
async function parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, password: '' });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const structuredPages = [];

    const isOcrEnabled = enableOcrCheckbox && enableOcrCheckbox.checked;
    const ocrLang = ocrLanguageSelect ? ocrLanguageSelect.value : 'spa';
    const forceOcr = forceOcrAllCheckbox ? forceOcrAllCheckbox.checked : false;
    const detectTables = enableTableIntelligenceCheckbox && detectPdfTablesCheckbox && detectPdfTablesCheckbox.checked;

    for (let i = 1; i <= numPages; i++) {
        const percent = 10 + Math.floor((i / numPages) * 60);
        updateProgress(percent, `Processing PDF page ${i} of ${numPages}...`);
        
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.5 });

        let textItems = textContent.items.map(item => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
            fontName: item.fontName
        }));

        let pageSourceType = "native_text";
        let ocrConfidenceScore = null;

        const totalCharCount = textItems.reduce((acc, curr) => acc + curr.text.trim().length, 0);
        if (isOcrEnabled && (forceOcr || totalCharCount < 15)) {
            updateProgress(percent, `Running OCR on scanned page ${i} of ${numPages}...`);
            pageSourceType = "ocr_fallback";
            
            const ocrResult = await performOcrOnPage(page, viewport, ocrLang);
            textItems = ocrResult.items;
            ocrConfidenceScore = ocrResult.confidence;
        }

        const sortedBlocks = sortTextByColumnsAndReadingOrder(textItems, viewport.width);
        
        let detectedTablesList = [];
        if (detectTables) {
            detectedTablesList = detectTablesInTextItems(textItems, viewport.width);
        }
        
        structuredPages.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height,
            sourceType: pageSourceType,
            ocrConfidence: ocrConfidenceScore,
            layout: sortedBlocks,
            tables: detectedTablesList
        });
    }

    return {
        fileName: file.name,
        fileType: 'pdf',
        totalPages: numPages,
        pages: structuredPages
    };
}

function detectTablesInTextItems(items, pageWidth) {
    if (!items || items.length === 0) return [];

    const rowMap = {};
    items.forEach(item => {
        const yBucket = Math.round(item.y / 12) * 12;
        if (!rowMap[yBucket]) rowMap[yBucket] = [];
        rowMap[yBucket].push(item);
    });

    const rows = Object.keys(rowMap)
        .sort((a, b) => b - a)
        .map(y => {
            const rowItems = rowMap[y];
            rowItems.sort((i1, i2) => i1.x - i2.x);
            return rowItems.map(i => i.text.trim());
        });

    const tableRows = rows.filter(r => r.length >= 2);
    if (tableRows.length < 3) return [];

    return [{
        tableStructureConfidence: tableRows.length > 5 ? "high" : "moderate",
        rowCount: tableRows.length,
        columnCountEstimated: Math.max(...tableRows.map(r => r.length)),
        rows: tableRows
    }];
}

async function performOcrOnPage(page, viewport, lang) {
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    const imageDataUrl = canvas.toDataURL('image/png');

    try {
        const worker = await Tesseract.createWorker(lang);
        const ret = await worker.recognize(imageDataUrl);
        await worker.terminate();

        const words = ret.data.words || [];
        const items = words.map(w => ({
            text: w.text,
            x: w.bbox.x0,
            y: viewport.height - w.bbox.y1,
            width: w.bbox.x1 - w.bbox.x0,
            height: w.bbox.y1 - w.bbox.y0,
            fontName: 'OCR-Font'
        }));

        return { items: items, confidence: ret.data.confidence || 0 };
    } catch (err) {
        console.error("OCR execution failed:", err);
        return { items: [], confidence: 0 };
    }
}

function sortTextByColumnsAndReadingOrder(items, pageWidth) {
    if (items.length === 0) return { headers: [], columns: [] };

    const midPoint = pageWidth / 2;
    const leftColumn = [];
    const rightColumn = [];
    const fullWidthElements = [];

    items.forEach(item => {
        if (item.x < midPoint - 20 && (item.x + item.width) > midPoint + 20) {
            fullWidthElements.push(item);
        } else if (item.x < midPoint) {
            leftColumn.push(item);
        } else {
            rightColumn.push(item);
        }
    });

    const sortByYDesc = (a, b) => b.y - a.y || a.x - b.x;
    leftColumn.sort(sortByYDesc);
    rightColumn.sort(sortByYDesc);
    fullWidthElements.sort(sortByYDesc);

    return {
        headers: fullWidthElements.map(i => i.text),
        columns: [
            { columnId: 1, text: leftColumn.map(i => i.text) },
            { columnId: 2, text: rightColumn.map(i => i.text) }
        ]
    };
}

// -------------------------------------------------------------
// Parser 2: TXT Parser (.txt)
// -------------------------------------------------------------
async function parseTXT(file) {
    updateProgress(50, 'Reading text file...');
    const rawText = await file.text();
    const lines = rawText.split(/\r?\n/);
    return {
        fileName: file.name,
        fileType: 'txt',
        totalLines: lines.length,
        lines: lines
    };
}

// -------------------------------------------------------------
// Parser 3: JSON File Parser (.json)
// -------------------------------------------------------------
async function parseJSONFile(file) {
    updateProgress(50, 'Validating JSON file...');
    const rawText = await file.text();
    try {
        const parsed = JSON.parse(rawText);
        return {
            fileName: file.name,
            fileType: 'json',
            validJSON: true,
            data: parsed
        };
    } catch (err) {
        throw new Error(`Malformed JSON syntax: ${err.message}`);
    }
}

// -------------------------------------------------------------
// Parser 4: Phase 6 Spreadsheet & Table Parser (.csv, .xlsx, .xls)
// -------------------------------------------------------------
async function parseSpreadsheet(file, ext) {
    updateProgress(50, `Parsing ${ext.toUpperCase()} spreadsheet...`);
    const arrayBuffer = await file.arrayBuffer();
    
    const extractFormulas = enableTableIntelligenceCheckbox && extractFormulasCheckbox && extractFormulasCheckbox.checked;
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellFormula: extractFormulas, cellDates: true });
    
    const preserveStrings = preserveStringsCheckbox ? preserveStringsCheckbox.checked : true;
    const rawOption = !preserveStrings;
    const structureMode = spreadsheetStructureSelect ? spreadsheetStructureSelect.value : 'objects';

    if (ext === 'csv') {
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        let rowsData;
        if (structureMode === 'arrays') {
            rowsData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: rawOption });
        } else {
            rowsData = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: rawOption });
        }

        return {
            fileName: file.name,
            fileType: 'csv',
            structureFormat: structureMode,
            totalRows: rowsData.length,
            data: rowsData
        };
    }

    const sheetsData = {};
    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        let sheetRows;

        if (structureMode === 'arrays') {
            sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: rawOption });
        } else {
            sheetRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: rawOption });
        }

        sheetsData[sheetName] = {
            sheetOrderIndex: workbook.SheetNames.indexOf(sheetName) + 1,
            rowCount: sheetRows.length,
            rows: sheetRows
        };
    });

    return {
        fileName: file.name,
        fileType: ext,
        structureFormat: structureMode,
        sheetNames: workbook.SheetNames,
        sheets: sheetsData
    };
}

// =============================================================
// BIBLE CONVERSION & VALIDATION ENGINE
// =============================================================

const KNOWN_BIBLE_BOOKS = [
    // Spanish & English
    "Génesis", "Genesis", "Éxodo", "Exodo", "Exodus", "Levítico", "Levitico", "Leviticus",
    "Números", "Numeros", "Numbers", "Deuteronomio", "Deuteronomy", "Josué", "Josue", "Joshua",
    "Jueces", "Judges", "Rut", "Ruth", "1 Samuel", "2 Samuel", "1 Reyes", "1 Kings", "2 Reyes", "2 Kings",
    "1 Crónicas", "1 Cronicas", "1 Chronicles", "2 Crónicas", "2 Cronicas", "2 Chronicles",
    "Esdras", "Ezra", "Nehemías", "Nehemias", "Nehemiah", "Ester", "Esther", "Job", "Salmos", "Psalms",
    "Proverbios", "Proverbs", "Eclesiastés", "Eclesiastes", "Ecclesiastes", "Cantares", "Song of Solomon",
    "Isaías", "Isaias", "Isaiah", "Jeremías", "Jeremias", "Jeremiah", "Lamentaciones", "Lamentations",
    "Ezequiel", "Ezekiel", "Daniel", "Oseas", "Hosea", "Joel", "Amós", "Amos", "Abdías", "Abdias", "Obadiah",
    "Jonás", "Jonas", "Jonah", "Miqueas", "Micah", "Nahúm", "Nahum", "Habacuc", "Habakkuk",
    "Sofonías", "Sofonias", "Zephaniah", "Hageo", "Haggai", "Zacarías", "Zacarias", "Zechariah", "Malaquías", "Malachias", "Malachi",
    "Mateo", "Matthew", "Marcos", "Mark", "Lucas", "Luke", "Juan", "John", "Hechos", "Acts",
    "Romanos", "Romans", "1 Corintios", "1 Corinthians", "2 Corintios", "2 Corinthians",
    "Gálatas", "Galatas", "Galatians", "Efesios", "Ephesians", "Filipenses", "Philippians",
    "Colosenses", "Colossians", "1 Tesalonicenses", "1 Thessalonians", "2 Tesalonicenses", "2 Thessalonians",
    "1 Timoteo", "1 Timothy", "2 Timoteo", "2 Timothy", "Tito", "Titus", "Filemón", "Filemon", "Philemon",
    "Hebreos", "Hebrews", "Santiago", "James", "1 Pedro", "1 Peter", "2 Pedro", "2 Peter",
    "1 Juan", "1 John", "2 Juan", "2 John", "3 Juan", "3 John", "Judas", "Jude", "Apocalipsis", "Revelation",
    // French
    "Genèse", "Exode", "Lévitique", "Nombres", "Deutéronome", "Josué", "Juges", "Ruth",
    "1 Rois", "2 Rois", "1 Chroniques", "2 Chroniques", "Néhémie", "Psaumes", "Proverbes",
    "Ecclésiaste", "Cantique des Cantiques", "Ésaïe", "Jérémie", "Ézéchiel", "Osée", "Michée",
    "Sophonie", "Aggée", "Zacharie", "Malachie", "Matthieu", "Marc", "Luc", "Jean", "Actes",
    "Romains", "1 Corinthiens", "2 Corinthiens", "Galates", "Éphésiens", "Philippiens", "Colossiens",
    "1 Thessaloniciens", "2 Thessaloniciens", "1 Timothée", "2 Timothée", "Hébreux", "Jacques",
    "1 Pierre", "2 Pierre", "Apocalypse",
    // Tagalog
    "Mga Bilang", "Mga Hukom", "1 Mga Hari", "2 Mga Hari", "1 Cronica", "2 Cronica", "Nehemias",
    "Mga Awit", "Kawikaan", "Awit ni Solomon", "Mga Panaghoy", "Zefanias", "Malakias", "Mga Gawa",
    "Roma", "1 Corinto", "2 Corinto", "Galacia", "Efeso", "Filipos", "Colosas", "1 Tesalonica",
    "2 Tesalonica", "Hebreo", "Apocalipsis",
    // Ewe
    "Exodos", "Yoshua", "Ʋɔdrɔlawo", "Fiawo 1", "Fiawo 2", "Kronika 1", "Kronika 2", "Nehemia",
    "Psalmo", "Lododowo", "Nyagblɔla", "Hadzidza Fe Hadzidza", "Yesaya", "Yeremiya", "Avalagbe",
    "Hosea", "Obadia", "Mika", "Habakuk", "Sefania", "Hagai", "Zekaria", "Malaki", "Marko",
    "Luka", "Yohanes", "Dɔwɔwɔwo", "Romalɔwo", "Korintotɔwo 1", "Korintotɔwo 2", "Galatiatɔwo",
    "Efesotɔwo", "Filipitɔwo", "Kolosetɔwo", "Tesalonikatɔwo 1", "Tesalonikatɔwo 2", "Timoteo 1",
    "Timoteo 2", "Hebritɔwo", "Yakobo", "Petro 1", "Petro 2", "Yohanes 1", "Yohanes 2",
    "Yohanes 3", "Yuda", "Nyaɖeɖefia"
];

async function processBibleData(parsedDocument, originalFileName) {
    updateProgress(80, 'Structuring Bible books, chapters, and verses...');

    const translationTitle = bibleTranslationInput ? (bibleTranslationInput.value.trim() || 'Custom Bible Edition') : 'Custom Bible Edition';
    const languageCode = bibleLanguageSelect ? bibleLanguageSelect.value : 'es';
    const stripFootnotes = stripFootnotesCheckbox ? stripFootnotesCheckbox.checked : true;
    const runValidation = runValidationCheckbox ? runValidationCheckbox.checked : true;

    const rawLines = extractSequentialLines(parsedDocument);
    const bibleStructure = parseBibleTextStream(rawLines, stripFootnotes);

    const result = {
        metadata: {
            targetApplication: "My Heart Treasury",
            translationTitle: translationTitle,
            language: languageCode,
            sourceFileName: originalFileName,
            convertedAt: new Date().toISOString(),
            copyrightInfo: "Source text preserved as provided.",
            converterVersion: "Phase 7 - Security & Canon Engine v1.0"
        },
        canon: bibleStructure
    };

    if (runValidation) {
        updateProgress(90, 'Running canonical validation audit...');
        const validationReport = validateBibleStructure(parsedDocument, bibleStructure);
        reportString = validationReport.reportText;
        result.validationSummary = validationReport.summary;

        if (reportString) {
            downloadReportBtn.style.display = 'inline-flex';
        }
    }

    return result;
}

function extractSequentialLines(parsedDoc) {
    const lines = [];
    if (parsedDoc.lines) return parsedDoc.lines;
    if (parsedDoc.pages) {
        parsedDoc.pages.forEach(page => {
            if (page.layout && page.layout.columns) {
                page.layout.columns.forEach(col => {
                    if (Array.isArray(col.text)) lines.push(...col.text);
                });
            }
        });
    }
    return lines;
}

function parseBibleTextStream(lines, stripFootnotes) {
    const books = [];
    let currentBook = null;
    let currentChapter = null;
    let currentVerse = null;

    const chapterRegex = /^(?:CAPÍTULO|CAPITULO|CHAPTER|CHAPITRE|TALA|TA)\s+(\d+)/i;
    const verseNumRegex = /^(\d+)\s+(.*)/;
    const footnoteMarkers = /^[a-z]$/i;

    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed === "SANTA BIBLIA" || trimmed === "Antiguo Testamento" || trimmed === "Nuevo Testamento") return;
        if (stripFootnotes && (footnoteMarkers.test(trimmed) || trimmed === "GEE" || trimmed === "HEB" || trimmed === "TJS")) return;

        const matchedBook = KNOWN_BIBLE_BOOKS.find(b => b.toLowerCase() === trimmed.toLowerCase());
        if (matchedBook) {
            if (currentBook && currentBook.name !== matchedBook) {
                if (currentVerse && currentChapter) {
                    currentChapter.verses.push(currentVerse);
                    currentVerse = null;
                }
                if (currentChapter && currentBook) {
                    currentBook.chapters.push(currentChapter);
                    currentChapter = null;
                }
                books.push(currentBook);
            }
            if (!currentBook || currentBook.name !== matchedBook) {
                currentBook = { name: matchedBook, chapters: [] };
            }
            return;
        }

        const chapMatch = trimmed.match(chapterRegex);
        if (chapMatch) {
            if (currentVerse && currentChapter) {
                currentChapter.verses.push(currentVerse);
                currentVerse = null;
            }
            if (currentChapter && currentBook) {
                currentBook.chapters.push(currentChapter);
            }
            if (!currentBook) currentBook = { name: "Unknown Book", chapters: [] };

            currentChapter = { chapterNumber: parseInt(chapMatch[1], 10), verses: [] };
            return;
        }

        const verseMatch = trimmed.match(verseNumRegex);
        if (verseMatch && currentChapter) {
            if (currentVerse) currentChapter.verses.push(currentVerse);
            currentVerse = { verseNumber: parseInt(verseMatch[1], 10), text: verseMatch[2].trim() };
            return;
        }

        if (currentVerse) {
            currentVerse.text += " " + trimmed;
        }
    });

    if (currentVerse && currentChapter) currentChapter.verses.push(currentVerse);
    if (currentChapter && currentBook) currentBook.chapters.push(currentChapter);
    if (currentBook && !books.includes(currentBook)) books.push(currentBook);

    return books;
}

// -------------------------------------------------------------
// Validation & Quality Assurance Module
// -------------------------------------------------------------
function validateBibleStructure(parsedDoc, bibleStructure) {
    let totalBooks = bibleStructure.length;
    let totalChapters = 0;
    let totalVerses = 0;
    let missingVersesCount = 0;
    let emptyVersesCount = 0;
    let lowConfidencePages = 0;

    const reportLines = [];
    reportLines.push("==================================================");
    reportLines.push("  MY HEART TREASURY - BIBLE PARSER AUDIT REPORT   ");
    reportLines.push("==================================================");
    reportLines.push(`Timestamp: ${new Date().toLocaleString()}`);
    reportLines.push(`Total Books Identified: ${totalBooks}\n`);

    if (parsedDoc.pages) {
        parsedDoc.pages.forEach(p => {
            if (p.sourceType === 'ocr_fallback') {
                reportLines.push(`[OCR INFO] Page ${p.pageNumber}: Processed via OCR (Confidence: ${p.ocrConfidence ? p.ocrConfidence.toFixed(1) : 'N/A'}%)`);
                if (p.ocrConfidence !== null && p.ocrConfidence < 75) {
                    reportLines.push(`  [WARNING] Page ${p.pageNumber}: Low OCR confidence score (<75%). Manual inspection recommended.`);
                    lowConfidencePages++;
                }
            }
            if (p.tables && p.tables.length > 0) {
                p.tables.forEach((t, tIdx) => {
                    reportLines.push(`[TABLE DETECTED] Page ${p.pageNumber}, Table ${tIdx + 1}: ${t.rowCount} rows, ${t.columnCountEstimated} estimated columns (Confidence: ${t.tableStructureConfidence})`);
                });
            }
        });
        reportLines.push("");
    }

    bibleStructure.forEach(book => {
        totalChapters += book.chapters.length;
        reportLines.push(`Book: ${book.name} (${book.chapters.length} chapters)`);

        book.chapters.forEach(chap => {
            totalVerses += chap.verses.length;
            let expectedVerse = 1;

            chap.verses.forEach(v => {
                if (v.verseNumber !== expectedVerse) {
                    reportLines.push(`  [WARNING] ${book.name} Chapter ${chap.chapterNumber}: Expected Verse ${expectedVerse}, found Verse ${v.verseNumber}`);
                    missingVersesCount++;
                    expectedVerse = v.verseNumber;
                }
                if (!v.text || v.text.length < 3) {
                    reportLines.push(`  [FLAG] ${book.name} ${chap.chapterNumber}:${v.verseNumber} - Suspiciously short or empty text: "${v.text}"`);
                    emptyVersesCount++;
                }
                expectedVerse++;
            });
        });
    });

    reportLines.push("\n--------------------------------------------------");
    reportLines.push("SUMMARY AUDIT STATS:");
    reportLines.push(`Total Books: ${totalBooks}`);
    reportLines.push(`Total Chapters: ${totalChapters}`);
    reportLines.push(`Total Verses Extracted: ${totalVerses}`);
    reportLines.push(`Sequence/Missing Flags: ${missingVersesCount}`);
    reportLines.push(`Empty/Short Text Flags: ${emptyVersesCount}`);
    reportLines.push(`Low-Confidence OCR Pages: ${lowConfidencePages}`);
    reportLines.push("--------------------------------------------------");

    const isPassed = missingVersesCount === 0 && emptyVersesCount === 0 && totalBooks > 0 && lowConfidencePages === 0;
    reportLines.push(`CANON VALIDATION STATUS: ${isPassed ? "PASSED" : "NEEDS REVIEW"}`);

    return {
        summary: {
            totalBooks,
            totalChapters,
            totalVerses,
            sequenceErrors: missingVersesCount,
            shortTextErrors: emptyVersesCount,
            lowConfidenceOcrPages: lowConfidencePages,
            passedValidation: isPassed
        },
        reportText: reportLines.join("\n")
    };
}

function updateProgress(percent, text) {
    progressBar.style.width = `${percent}%`;
    progressText.innerText = text;
}

// Download & Clipboard Handlers
downloadBtn.addEventListener('click', () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'faithful_converted.json';
    a.click();
});

downloadReportBtn.addEventListener('click', () => {
    if (!reportString) return;
    const blob = new Blob([reportString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bible_validation_report.txt';
    a.click();
});

if (copyBtn) {
    copyBtn.addEventListener('click', () => {
        if (!jsonString) return;
        navigator.clipboard.writeText(jsonString).then(() => {
            const span = copyBtn.querySelector('span');
            span.textContent = 'Copied!';
            setTimeout(() => { span.textContent = 'Copy JSON'; }, 2000);
        });
    });
}
