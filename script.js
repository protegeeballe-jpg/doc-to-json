const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const outputArea = document.getElementById('output');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const fileInfo = document.getElementById('fileInfo');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
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

async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        alert('Invalid file type. Please upload a valid PDF document.');
        return;
    }

    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    fileInfo.textContent = `Selected File: ${file.name} (${fileSizeMB} MB)`;
    
    progressContainer.classList.remove('hidden');
    updateProgress(10, 'Reading file buffer...');

    try {
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
            updateProgress(percent, `Processing page ${i} of ${numPages}...`);
            
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });

            // Extract items with coordinate values
            const textItems = textContent.items.map(item => ({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height,
                fontName: item.fontName
            }));

            // Layout-aware column sorting
            const sortedBlocks = sortTextByColumnsAndReadingOrder(textItems, viewport.width);
            
            structuredPages.push({
                pageNumber: i,
                width: viewport.width,
                height: viewport.height,
                layout: sortedBlocks
            });
        }

        const resultObject = {
            fileName: file.name,
            totalPages: numPages,
            pages: structuredPages
        };

        jsonString = JSON.stringify(resultObject, null, 2);
        outputArea.value = jsonString;
        downloadBtn.style.display = 'inline-block';

        updateProgress(100, 'Conversion complete!');
        statusDiv.textContent = "Conversion complete with advanced column sorting!";

    } catch (error) {
        if (error.name === 'PasswordException') {
            const password = prompt('This PDF is password-protected. Please enter the password:');
            if (password) {
                // Handle password logic if needed
            }
        } else {
            console.error('PDF Extraction Error:', error);
            alert('Failed to parse PDF. The file may be corrupted or unreadable.');
        }
    } finally {
        setTimeout(() => progressContainer.classList.add('hidden'), 2500);
    }
}

// Multi-column sorting algorithm to prevent text interleaving
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
