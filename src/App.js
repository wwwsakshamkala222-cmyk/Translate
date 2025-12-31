import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = "https://loddi8cwy6.execute-api.us-east-1.amazonaws.com/translate";
const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const Translator = () => {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [targetLang, setTargetLang] = useState("hi");
  const [isLoading, setIsLoading] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [translationMode, setTranslationMode] = useState("text");
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollProgress, setPollProgress] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);
  
  const pollIntervalRef = useRef(null);

  const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
];

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const handleInputChange = (e) => {
    const text = e.target.value;
    setInputText(text);
    setCharCount(text.length);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/html'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        alert("Please upload a valid document (PDF, DOCX, TXT, or HTML)");
        return;
      }
      
      if (file.size > 20 * 1024 * 1024) {
        alert("File size must be less than 20MB");
        return;
      }
      
      setSelectedFile(file);
      setJobStatus(null);
      setDownloadUrl(null);
    }
  };

  const pollStatus = (jobId) => {
    setIsPolling(true);
    setPollProgress(0);
    let attempts = 0;
    const maxAttempts = 360; 

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      setPollProgress(Math.min((attempts / maxAttempts) * 100, 95));

      try {
        const res = await axios.post(API_URL, { 
          type: "check_status", 
          jobId 
        });

        if (res.data.status === 'COMPLETED') {
          setJobStatus({ 
            success: true, 
            jobId,
            message: "Translation completed successfully!" 
          });
          setDownloadUrl(res.data.downloadUrl);
          setPollProgress(100);
          setIsPolling(false);
          clearInterval(pollIntervalRef.current);
        } else if (res.data.status === 'FAILED') {
          setJobStatus({ 
            success: false, 
            message: "Translation job failed. Please try again." 
          });
          setIsPolling(false);
          clearInterval(pollIntervalRef.current);
        } else {
          // Still processing
          setJobStatus({ 
            success: true, 
            jobId,
            message: `Processing... (${res.data.status})` 
          });
        }
      } catch (error) {
        console.error("Polling error:", error);
      }

      // Timeout after max attempts
      if (attempts >= maxAttempts) {
        setJobStatus({ 
          success: false, 
          message: "Job timed out. Check AWS console for status." 
        });
        setIsPolling(false);
        clearInterval(pollIntervalRef.current);
      }
    }, 10000); // Poll every 10 seconds
  };

  const handleTranslate = async (isDocument = false) => {
    setIsLoading(true);
    setTranslatedText("");
    setJobStatus(null);
    setDownloadUrl(null);

    try {
      if (isDocument) {
        if (!selectedFile) {
          alert("Please select a document to translate");
          setIsLoading(false);
          return;
        }

        // --- STEP 1: Get Presigned Upload URL ---
        setJobStatus({ success: true, message: "Getting upload URL..." });
        const urlRes = await axios.post(API_URL, { 
          type: "get_upload_url", 
          file_name: selectedFile.name 
        });
        
        // Destructure both the URL and the MIME type returned by your new Lambda
        const { uploadUrl, mimeType } = urlRes.data;

        // --- STEP 2: Upload file to S3 (ONLY ONE UPLOAD NEEDED) ---
        setJobStatus({ success: true, message: "Uploading document to S3..." });
        
        // We use the mimeType the Lambda provided so the S3 signature matches
        await axios.put(uploadUrl, selectedFile, {
          headers: { "Content-Type": mimeType } 
        });

        // --- STEP 3: Start translation job ---
        setJobStatus({ success: true, message: "Starting translation job..." });
        const jobRes = await axios.post(API_URL, {
          type: "document",
          file_name: selectedFile.name,
          target_lang: targetLang
        });

        const jobId = jobRes.data.jobId;
        setJobStatus({ success: true, jobId, message: "Job started! Checking status..." });

        // --- STEP 4: Start polling ---
        setIsLoading(false);
        pollStatus(jobId);

      } else {
        // Text translation logic (This part is already correct)
        const response = await axios.post(API_URL, {
          type: "text",
          text: inputText,
          target_lang: targetLang
        });
        if (response.data?.translatedText) setTranslatedText(response.data.translatedText);
        setIsLoading(false);
      }
    } catch (error) {
      // Error handling logic (This part is already correct)
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(translatedText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleClear = () => {
    setInputText("");
    setTranslatedText("");
    setCharCount(0);
    setSelectedFile(null);
    setJobStatus(null);
    setDownloadUrl(null);
    setIsPolling(false);
    setPollProgress(0);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setJobStatus(null);
    setDownloadUrl(null);
    setIsPolling(false);
    setPollProgress(0);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };

  const cancelPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    setIsPolling(false);
    setPollProgress(0);
    setJobStatus({ 
      success: false, 
      message: "Polling cancelled. You can check status manually in AWS console." 
    });
  };

  const selectedLanguage = languages.find(lang => lang.code === targetLang);

  return (
    <div className="translator-container">
      {/* Header */}
      <header className="translator-header">
        <div className="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
        </div>
        <div className="header-text">
          <h1>Cloud Translator</h1>
          <p>Powered by AWS Translate</p>
        </div>
      </header>

      {/* Main Card */}
      <div className="translator-card">
        {/* Mode Toggle */}
        <div className="mode-toggle-section">
          <div className="mode-toggle">
            <button
              className={`mode-btn ${translationMode === 'text' ? 'active' : ''}`}
              onClick={() => setTranslationMode('text')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Text Translation
            </button>
            <button
              className={`mode-btn ${translationMode === 'document' ? 'active' : ''}`}
              onClick={() => setTranslationMode('document')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 18v-6" />
                <path d="M9 15l3-3 3 3" />
              </svg>
              Document Translation
            </button>
          </div>
        </div>

        {/* Language Selection */}
        <div className="language-section">
          <div className="language-from">
            <span className="language-label">From</span>
            <div className="language-display">
              <span className="flag">🌐</span>
              <span>Auto Detect</span>
            </div>
          </div>

          <div className="swap-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>

          <div className="language-to">
            <span className="language-label">To</span>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="language-select"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Text Translation Mode */}
        {translationMode === 'text' && (
          <>
            <div className="translation-panels">
              {/* Input Panel */}
              <div className="panel input-panel">
                <div className="panel-header">
                  <span className="panel-title">Original Text</span>
                  {inputText && (
                    <button className="clear-btn" onClick={handleClear}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  className="text-area"
                  placeholder="Enter text to translate..."
                  value={inputText}
                  onChange={handleInputChange}
                  maxLength={5000}
                />
                <div className="panel-footer">
                  <span className="char-count">{charCount} / 5000</span>
                </div>
              </div>

              {/* Output Panel */}
              <div className="panel output-panel">
                <div className="panel-header">
                  <span className="panel-title">
                    {selectedLanguage?.flag} {selectedLanguage?.name} Translation
                  </span>
                  {translatedText && !translatedText.startsWith("Error") && (
                    <button className={`copy-btn ${copySuccess ? 'copied' : ''}`} onClick={handleCopy}>
                      {copySuccess ? (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="output-area">
                  {isLoading ? (
                    <div className="loading-state">
                      <div className="loading-spinner"></div>
                      <span>Translating...</span>
                    </div>
                  ) : translatedText ? (
                    <p className={`translated-text ${translatedText.startsWith("Error") ? 'error-text' : ''}`}>
                      {translatedText}
                    </p>
                  ) : (
                    <p className="placeholder-text">Translation will appear here</p>
                  )}
                </div>
              </div>
            </div>

            {/* Translate Button */}
            <button
              className={`translate-btn ${isLoading ? 'loading' : ''}`}
              onClick={() => handleTranslate(false)}
              disabled={isLoading || !inputText.trim()}
            >
              {isLoading ? (
                <>
                  <div className="btn-spinner"></div>
                  Translating...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Translate Text
                </>
              )}
            </button>
          </>
        )}

        {/* Document Translation Mode */}
        {translationMode === 'document' && (
          <div className="document-section">
            {/* File Upload Area */}
            <div className="upload-area">
              {!selectedFile ? (
                <label className="upload-label">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.html"
                    onChange={handleFileChange}
                    className="file-input"
                  />
                  <div className="upload-content">
                    <div className="upload-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className="upload-text">
                      <span className="upload-title">Click to upload or drag and drop</span>
                      <span className="upload-subtitle">DOCX, TXT, HTML (Max 20MB)</span>
                    </div>
                  </div>
                </label>
              ) : (
                <div className="file-preview">
                  <div className="file-info">
                    <div className="file-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="file-details">
                      <span className="file-name">{selectedFile.name}</span>
                      <span className="file-size">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                  <button 
                    className="remove-file-btn" 
                    onClick={removeFile}
                    disabled={isLoading || isPolling}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Progress Bar (during polling) */}
            {isPolling && (
              <div className="progress-section">
                <div className="progress-header">
                  <span className="progress-title">Processing Document...</span>
                  <span className="progress-percent">{Math.round(pollProgress)}%</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${pollProgress}%` }}
                  ></div>
                </div>
                <div className="progress-footer">
                  <span className="progress-info">Checking status every 15 seconds</span>
                  <button className="cancel-polling-btn" onClick={cancelPolling}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Job Status */}
            {jobStatus && (
              <div className={`job-status ${jobStatus.success ? 'success' : 'error'}`}>
                <div className="status-icon">
                  {jobStatus.success ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  )}
                </div>
                <div className="status-content">
                  <span className="status-message">{jobStatus.message}</span>
                  {jobStatus.jobId && (
                    <span className="job-id">Job ID: {jobStatus.jobId}</span>
                  )}
                </div>
              </div>
            )}

            {/* Download Section */}
            {downloadUrl && (
              <div className="download-section">
                <div className="download-card">
                  <div className="download-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </div>
                  <div className="download-info">
                    <span className="download-title">Your translated document is ready!</span>
                    <span className="download-subtitle">Click below to download</span>
                  </div>
                  <a 
                    href={downloadUrl} 
                    className="download-btn"
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download Document
                  </a>
                </div>
              </div>
            )}

            {/* Translate Document Button */}
            <button
              className={`translate-btn ${isLoading ? 'loading' : ''}`}
              onClick={() => handleTranslate(true)}
              disabled={isLoading || !selectedFile || isPolling}
            >
              {isLoading ? (
                <>
                  <div className="btn-spinner"></div>
                  Processing...
                </>
              ) : isPolling ? (
                <>
                  <div className="btn-spinner"></div>
                  Checking Status...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M12 18v-6" />
                    <path d="M9 15l3-3 3 3" />
                  </svg>
                  Translate Document
                </>
              )}
            </button>

            {/* Info Box */}
            <div className="info-box">
              <div className="info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <div className="info-content">
                <span className="info-title">How Document Translation Works</span>
                <ul className="info-list">
                  <li>Upload your document (DOCX, TXT, or HTML)</li>
                  <li>Select your target language</li>
                  <li>Document is uploaded to AWS S3</li>
                  <li>Translation job runs in AWS Translate</li>
                  <li>Status is checked automatically every 15 seconds</li>
                  <li>Download link appears when complete</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="translator-footer">
        <p>🔒 Secure • ⚡ Fast • ✓ Accurate</p>
      </footer>
    </div>
  );
};

export default Translator;