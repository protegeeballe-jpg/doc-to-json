const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const outputArea = document.getElementById('output');
const downloadBtn = document.getElementById('downloadBtn');
const downloadReportBtn = document.getElementById('downloadReportBtn');
const statusDiv = document.getElementById('status');
const fileInfo = document.getElementById('fileInfo');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const preserveStringsCheckbox = document.getElementById('preserveStrings');

// Phase 4 UI Elements
const enableBibleModeCheckbox = document.getElementById('enableBibleMode');
const bibleOptionsDiv = document.getElementById('bibleOptions');
const bibleTranslationInput = document.getElementById('bibleTranslation');
const bibleLanguageSelect = document.getElementById('bibleLanguage');
const stripFootnotesCheckbox = document.getElementById('stripFootnotes');
const runValidationCheckbox = document.getElementById('runValidation');

let jsonString = '';
let reportString = '';

// Configure worker for PDF.js using the global version
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Toggle Bible Mode Controls Display
if (enableBibleModeCheckbox) {
    enableBibleModeCheckbox.addEventListener('change', () => {
        if (enableBibleModeCheckbox.checked) {
            bibleOptionsDiv.classList.remove('hidden');
        } else {
            bibleOptionsDiv.classList.add('hidden');
        }
    });
}

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-blue-600', 'bg-blue-50');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-blue-600', 'bg-blue-50');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-600', 'bg-blue-50');
    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFile({ target: fileInput });
    }
});

fileInput.addEventListener('change', handleFile);

// Universal Main File Router
async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileExt = fileName.split('.').pop().toLowerCase();
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    
    fileInfo.textContent = `Selected File: ${fileName} (${fileSizeMB} MB)`;
    progressContainer.classList.remove('hidden');
    downloadReportBtn.style.display = 'none';
    updateProgress(10, `Routing parser for .${fileExt} file...`);

    try {
        let resultObject = null;
        const isBibleMode = enableBibleModeCheckbox && enableBibleModeCheckbox.checked;

        if (fileExt === 'pdf') {
            const rawPdfData = await parsePDF(file);
            if (isBibleMode) {
                resultObject = await processBibleData(rawPdfData, file.name);
            } else {
                resultObject = rawPdfData;
            }
        } else if (fileExt === 'txt') {
            const rawTxtData = await parseTXT(file);
            if (isBibleMode) {
                resultObject = await processBibleData(rawTxtData, file.name);
            } else {
                resultObject = rawTxtData;
            }
        } else if (fileExt === 'json') {
            resultObject = await parseJSONFile(file);
        } else if (fileExt === 'csv' || fileExt === 'xlsx' || fileExt === 'xls') {
            resultObject = await parseSpreadsheet(file, fileExt);
        } else {
            throw new Error(`Unsupported file format: .${fileExt}`);
        }

        jsonString = JSON.stringify(resultObject, null, 2);
        outputArea.value = jsonString;
        downloadBtn.style.display = 'inline-block';

        updateProgress(100, 'Conversion complete!');
        statusDiv.textContent = isBibleMode 
            ? `Successfully converted Bible document to structured canon JSON!`
            : `Successfully parsed .${fileExt} document!`;

    } catch (error) {
        if (error.name === 'PasswordException') {
            const password = prompt('This PDF is password-protected. Please enter the password:');
            if (password) {
                // Handle password logic if needed
            }
        } else {
            console.error('Extraction Error:', error);
            statusDiv.textContent = `Error processing file: ${error.message}`;
            alert(`Failed to parse file: ${error.message}`);
        }
    } finally {
        setTimeout(() => progressContainer.classList.add('hidden'), 2500);
    }
}

// -------------------------------------------------------------
// Parser 1: Standard PDF Parser (Layout-aware coordinate sorting)
// -------------------------------------------------------------
async function parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        password: '' 
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const structuredPages = [];

    for (let i = 1; i <= numPages; i++) {
        const percent = 10 + Math.floor((i / numPages) * 70);
        updateProgress(percent, `Extracting PDF text page ${i} of ${numPages}...`);
        
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        const textItems = textContent.items.map(item => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
            fontName: item.fontName
        }));

        const sortedBlocks = sortTextByColumnsAndReadingOrder(textItems, viewport.width);
        
        structuredPages.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height,
            layout: sortedBlocks
        });
    }

    return {
        fileName: file.name,
        fileType: 'pdf',
        totalPages: numPages,
        pages: structuredPages
    };
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
// Parser 4: Spreadsheet & CSV Parser (.csv, .xlsx, .xls)
// -------------------------------------------------------------
async function parseSpreadsheet(file, ext) {
    updateProgress(50, `Parsing ${ext.toUpperCase()} spreadsheet...`);
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    const preserveStrings = preserveStringsCheckbox ? preserveStringsCheckbox.checked : true;
    const rawOption = !preserveStrings;

    if (ext === 'csv') {
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: rawOption });
        
        return {
            fileName: file.name,
            fileType: 'csv',
            totalRows: rows.length,
            rows: rows
        };
    }

    const sheetsData = {};
    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        sheetsData[sheetName] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: rawOption });
    });

    return {
        fileName: file.name,
        fileType: ext,
        sheetNames: workbook.SheetNames,
        sheets: sheetsData
    };
}

// =============================================================
// PHASE 4: BIBLE-SPECIFIC CONVERSION & VALIDATION ENGINE
// =============================================================

const KNOWN_BIBLE_BOOKS = [
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
    "1 Juan", "1 John", "2 Juan", "2 John", "3 Juan", "3 John", "Judas", "Jude", "Apocalipsis", "Revelation"
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
            converterVersion: "Phase 4 - Engine v1.0"
        },
        canon: bibleStructure
    };

    if (runValidation) {
        updateProgress(90, 'Running canonical validation audit...');
        const validationReport = validateBibleStructure(bibleStructure);
        reportString = validationReport.reportText;
        result.validationSummary = validationReport.summary;

        if (reportString) {
            downloadReportBtn.style.display = 'inline-block';
        }
    }

    return result;
}

function extractSequentialLines(parsedDoc) {
    const lines = [];
    if (parsedDoc.lines) {
        return parsedDoc.lines;
    }
    if (parsedDoc.pages) {
        parsedDoc.pages.forEach(page => {
            if (page.layout && page.layout.columns) {
                page.layout.columns.forEach(col => {
                    if (Array.isArray(col.text)) {
                        lines.push(...col.text);
                    }
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

    const chapterRegex = /^(?:CAPÍTULO|CAPITULO|CHAPTER)\s+(\d+)/i;
    const verseNumRegex = /^(\d+)\s+(.*)/;

    // Single-letter footnote markers commonly present in LDS/KJV study editions
    const footnoteMarkers = /^[a-z]$/i;

    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;

        // Strip non-verse header noise
        if (trimmed === "SANTA BIBLIA" || trimmed === "Antiguo Testamento" || trimmed === "Nuevo Testamento") return;

        if (stripFootnotes && (footnoteMarkers.test(trimmed) || trimmed === "GEE" || trimmed === "HEB" || trimmed === "TJS")) {
            return;
        }

        // 1. Detect Book Name
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

        // 2. Detect Chapter Heading
        const chapMatch = trimmed.match(chapterRegex);
        if (chapMatch) {
            if (currentVerse && currentChapter) {
                currentChapter.verses.push(currentVerse);
                currentVerse = null;
            }
            if (currentChapter && currentBook) {
                currentBook.chapters.push(currentChapter);
            }

            if (!currentBook) {
                currentBook = { name: "Unknown Book", chapters: [] };
            }

            currentChapter = {
                chapterNumber: parseInt(chapMatch[1], 10),
                verses: []
            };
            return;
        }

        // 3. Detect Verse Numbers & Verse Text
        const verseMatch = trimmed.match(verseNumRegex);
        if (verseMatch && currentChapter) {
            if (currentVerse) {
                currentChapter.verses.push(currentVerse);
            }
            currentVerse = {
                verseNumber: parseInt(verseMatch[1], 10),
                text: verseMatch[2].trim()
            };
            return;
        }

        // 4. Multi-line & Multi-page Verse Text Accumulator
        if (currentVerse) {
            currentVerse.text += " " + trimmed;
        }
    });

    if (currentVerse && currentChapter) {
        currentChapter.verses.push(currentVerse);
    }
    if (currentChapter && currentBook) {
        currentBook.chapters.push(currentChapter);
    }
    if (currentBook && !books.includes(currentBook)) {
        books.push(currentBook);
    }

    return books;
}

// -------------------------------------------------------------
// Validation & Quality Assurance Module
// -------------------------------------------------------------
function validateBibleStructure(bibleStructure) {
    let totalBooks = bibleStructure.length;
    let totalChapters = 0;
    let totalVerses = 0;
    let missingVersesCount = 0;
    let emptyVersesCount = 0;

    const reportLines = [];
    reportLines.push("==================================================");
    reportLines.push("  MY HEART TREASURY - BIBLE PARSER AUDIT REPORT   ");
    reportLines.push("==================================================");
    reportLines.push(`Timestamp: ${new Date().toLocaleString()}`);
    reportLines.push(`Total Books Identified: ${totalBooks}\n`);

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
    reportLines.push("--------------------------------------------------");

    const isPassed = missingVersesCount === 0 && emptyVersesCount === 0 && totalBooks > 0;
    reportLines.push(`CANON VALIDATION STATUS: ${isPassed ? "PASSED" : "NEEDS REVIEW"}`);

    return {
        summary: {
            totalBooks,
            totalChapters,
            totalVerses,
            sequenceErrors: missingVersesCount,
            shortTextErrors: emptyVersesCount,
            passedValidation: isPassed
        },
        reportText: reportLines.join("\n")
    };
}

function updateProgress(percent, text) {
    progressBar.style.width = `${percent}%`;
    progressText.innerText = text;
}

// Download Handlers
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
