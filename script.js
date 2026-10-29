// JavaScript Upload & Validation Handler
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');

// Drag & Drop Events
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-indigo-500', 'bg-indigo-50');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

function handleFiles(files) {
  const file = files[0]; // Primary focus on single/batch queue
  if (!file) return;

  // 1. Validate file type
  if (file.type !== 'application/pdf') {
    alert('Invalid file type. Please upload a valid PDF document.');
    return;
  }

  // 2. Display file metadata
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
  fileInfo.innerHTML = `<strong>Selected:</strong> ${file.name} (${fileSizeMB} MB)`;

  // Trigger conversion pipeline
  processPDFFile(file);
}
