const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const outputArea = document.getElementById('output');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const fileInfo = document.getElementById('fileInfo');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const preserveStringsCheckbox = document.getElementById('preserveStrings');
let jsonString = '';

// Configure worker for PDF.js using the global version
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

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

// Universal Main File Router with Phase 3 Configurations
async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileExt = fileName.split('.').pop().toLowerCase();
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    
    fileInfo.textContent = `Selected File: ${fileName} (${fileSizeMB} MB)`;
    progressContainer.classList.remove('hidden');
    updateProgress(10, `Routing parser for .${fileExt} file...`);

    try {
        let resultObject = null;

        if (fileExt === 'pdf') {
            resultObject = await parsePDF(file);
        } else if (fileExt === 'txt') {
            resultObject = await parseTXT(file);
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
        statusDiv.textContent = `Successfully parsed .${fileExt} document!`;

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
// Parser 1: PDF Parser (Layout-aware coordinate sorting)
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
        const percent = 10 + Math.floor((i / numPages) * 80);
        updateProgress(percent, `Processing PDF page ${i} of ${numPages}...`);
        
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
// Parser 3: JSON File Parser & Validator (.json)
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
    
    // Check Phase 3 configuration toggle for string preservation
    const preserveStrings = preserveStringsCheckbox ? preserveStringsCheckbox.checked : true;
    const rawOption = !preserveStrings; // if preserveStrings is true, raw is false (returns formatted strings)

    // Friend's Suggestion 1: Give CSV its own dedicated rows structure
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

    // For multi-sheet Excel workbooks (.xlsx, .xls)
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

function updateProgress(percent, text) {
    progressBar.style.width = `${percent}%`;
    progressText.innerText = text;
}

downloadBtn.addEventListener('click', () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'faithful_converted.json';
    a.click();
});
