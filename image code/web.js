import React, { useState, useEffect, useCallback } from 'react';

// IMPORTANT: Replace this with the actual URL of your Flask backend.
// If running locally, it's usually 'http://localhost:5000'.
// When deployed, it will be your deployed backend's URL.
const backendUrl = 'http://localhost:5000'; // Keep this consistent with your backend.py

function App() {
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [selectedResolution, setSelectedResolution] = useState('720p');
  // `downloads` will store an object where keys are file_ids and values are download details
  // This is crucial for tracking individual download progress and status
  const [downloads, setDownloads] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false); // For overall loading state when initiating download

  // Function to initiate a download
  const handleDownload = async () => {
    if (!videoUrl) {
      setErrorMessage('Please enter a video URL.');
      return;
    }
    setErrorMessage('');
    setLoading(true);
    console.log('Attempting to initiate download for:', videoUrl); // Debug log

    try {
      const response = await fetch(`${backendUrl}/download`, { // Use the /download endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: videoUrl,
          format: selectedFormat,
          resolution: selectedFormat === 'mp4' ? selectedResolution : undefined, // Only send resolution for MP4
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initiate download.');
      }

      const data = await response.json();
      console.log('Download initiated. Backend response:', data); // Debug log
      // The backend now returns a list of file_ids for tracking
      data.file_ids.forEach(fileId => {
        setDownloads(prevDownloads => ({
          ...prevDownloads,
          [fileId]: {
            id: fileId,
            url: videoUrl, // Store the URL for reference
            status: 'pending', // Initial status
            progress: 0, // Initialize progress to 0
            filename: null, // Will be updated by polling
            title: 'Fetching details...', // Will be updated by polling
            error: null,
          },
        }));
        console.log(`Added download ID ${fileId.substring(0, 8)}... to state.`); // Debug log
      });

      setVideoUrl(''); // Clear the input field after initiating download
    } catch (error) {
      console.error('Download initiation error:', error);
      setErrorMessage(`Error initiating download: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Callback function to poll for download status for a specific fileId
  // Using useCallback to prevent unnecessary re-creation of the function on re-renders
  const pollDownloadStatus = useCallback(async (fileId) => {
    console.log(`Polling status for ID: ${fileId.substring(0, 8)}...`); // Debug log
    try {
      const response = await fetch(`${backendUrl}/status/${fileId}`); // Poll the /status endpoint
      if (!response.ok) {
        throw new Error('Failed to fetch status.');
      }
      const data = await response.json();
      console.log(`Received status for ${fileId.substring(0, 8)}...:`, data); // Debug log

      setDownloads(prevDownloads => {
        const currentDownload = prevDownloads[fileId];
        if (!currentDownload) {
          console.log(`Download ID ${fileId.substring(0, 8)}... not found in state, stopping poll.`); // Debug log
          return prevDownloads; // If download was removed, stop processing
        }

        // Update the progress and status based on backend response
        const updatedDownload = {
          ...currentDownload,
          status: data.status,
          // Ensure percentage is parsed as a float, default to current progress if not available
          progress: data.percentage ? parseFloat(data.percentage) : currentDownload.progress, 
          filename: data.filename || currentDownload.filename,
          title: data.title || currentDownload.title,
          error: data.error || currentDownload.error,
        };

        // If download is completed or failed, stop polling for this specific fileId
        if (data.status === 'completed' || data.status === 'failed') {
          console.log(`Download ID ${fileId.substring(0, 8)}... is ${data.status}, stopping polling.`); // Debug log
          // No need to schedule next poll, just update the final state
          return { ...prevDownloads, [fileId]: updatedDownload };
        } else {
          // Otherwise, schedule the next poll after 1 second
          console.log(`Scheduling next poll for ID: ${fileId.substring(0, 8)}...`); // Debug log
          setTimeout(() => pollDownloadStatus(fileId), 1000); 
          return { ...prevDownloads, [fileId]: updatedDownload };
        }
      });

    } catch (error) {
      console.error(`Error polling status for ${fileId}:`, error); // Debug log
      setDownloads(prevDownloads => ({
        ...prevDownloads,
        [fileId]: {
          ...prevDownloads[fileId],
          status: 'failed',
          error: `Polling error: ${error.message}`,
        },
      }));
    }
  }, [backendUrl]); // Dependency on backendUrl to ensure correct endpoint

  // useEffect hook to manage starting/stopping polling for downloads
  useEffect(() => {
    console.log('useEffect for polling triggered. Current downloads state:', downloads); // Debug log
    // Iterate over current downloads to start or continue polling
    Object.values(downloads).forEach(download => {
      // Only start polling if it's pending or downloading AND not already being polled
      // The `_polling` flag is a simple way to prevent multiple `setTimeout` calls for the same download
      if ((download.status === 'pending' || download.status === 'downloading') && !download._polling) {
        setDownloads(prevDownloads => ({
          ...prevDownloads,
          [download.id]: { ...prevDownloads[download.id], _polling: true } // Mark as polling started
        }));
        console.log(`Initiating poll for new/active download ID: ${download.id.substring(0, 8)}...`); // Debug log
        pollDownloadStatus(download.id); // Initiate the polling
      }
    });
  }, [downloads, pollDownloadStatus]); // Rerun this effect when `downloads` state or `pollDownloadStatus` changes

  // Function to remove a download item from the display list
  const removeDownload = (fileId) => {
    console.log(`Removing download ID: ${fileId.substring(0, 8)}... from list.`); // Debug log
    setDownloads(prevDownloads => {
      const newDownloads = { ...prevDownloads };
      delete newDownloads[fileId]; // Remove the entry for the given fileId
      return newDownloads;
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          <span className="text-blue-600">Video</span> Downloader
        </h1>

        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {errorMessage}</span>
          </div>
        )}

        {/* Video URL Input */}
        <div className="mb-4">
          <label htmlFor="videoUrl" className="block text-gray-700 text-sm font-semibold mb-2">
            Video URL:
          </label>
          <input
            type="text"
            id="videoUrl"
            className="shadow-sm appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
            placeholder="e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Format Selection */}
        <div className="mb-4">
          <label htmlFor="downloadFormat" className="block text-gray-700 text-sm font-semibold mb-2">
            Format:
          </label>
          <div className="relative">
            <select
              id="downloadFormat"
              className="block appearance-none w-full bg-white border border-gray-300 text-gray-700 py-3 px-4 pr-8 rounded-lg shadow-sm leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              disabled={loading}
            >
              <option value="mp4">MP4 (Video)</option>
              <option value="mp3">MP3 (Audio Only)</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Resolution Selection (only for MP4) */}
        {selectedFormat === 'mp4' && (
          <div className="mb-6">
            <label htmlFor="resolution" className="block text-gray-700 text-sm font-semibold mb-2">
              Resolution:
            </label>
            <div className="relative">
              <select
                id="resolution"
                className="block appearance-none w-full bg-white border border-gray-300 text-gray-700 py-3 px-4 pr-8 rounded-lg shadow-sm leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                value={selectedResolution}
                onChange={(e) => setSelectedResolution(e.target.value)}
                disabled={loading}
              >
                {/* Added 'best' option as it's often useful for yt-dlp */}
                <option value="best">Best Available</option> 
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="2k">2K</option>
                <option value="4k">4K</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Download Button */}
        <button
          onClick={handleDownload}
          className="w-full bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-300 ease-in-out transform hover:scale-105"
          disabled={loading}
        >
          {loading ? 'Initiating Download...' : 'Download Video'}
        </button>
      </div>

      {/* Download Progress Display Section */}
      {Object.values(downloads).length > 0 && (
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md mt-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Download Progress</h2>
          {Object.values(downloads).map((download) => (
            <div key={download.id} className="mb-4 p-4 border border-gray-200 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-gray-700">
                  {download.title || `Download ID: ${download.id.substring(0, 8)}...`}
                </span>
                <button
                  onClick={() => removeDownload(download.id)}
                  className="text-gray-500 hover:text-red-500 text-sm"
                  title="Remove from list"
                >
                  ×
                </button>
              </div>
              <div className="text-sm text-gray-600 mb-2">Status: {download.status}</div>
              {/* Conditional rendering for progress bar */}
              {download.status === 'downloading' && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${download.progress}%` }}
                  ></div>
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-500 mt-1 block text-right">
                    {download.progress.toFixed(1)}%
                  </span>
                </div>
              )}
              {/* Conditional rendering for completed link */}
              {download.status === 'completed' && (
                <div className="text-green-600 font-medium">
                  Download Complete!{' '}
                  <a
                    href={`${backendUrl}/files/${download.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    Download {download.filename || 'file'}
                  </a>
                </div>
              )}
              {/* Conditional rendering for failed message */}
              {download.status === 'failed' && (
                <div className="text-red-600 font-medium">
                  Download Failed: {download.error || 'Unknown error'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;



async function startDownload() {
  const videoUrl = videoUrlInput.value;
  const format = document.getElementById('format').value;
  const resolution = document.getElementById('resolution').value;
  const accessCode = document.getElementById('accessCode').value;

  if (!videoUrl || !accessCode) {
    statusDiv.innerText = 'Please enter a video URL and access code.';
    return;
  }

  statusDiv.innerText = 'Sending download request...';
  downloadLinkDiv.innerHTML = '';

  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: videoUrl,
        format: format,
        resolution: format === 'mp4' ? resolution : null,
        access_code: accessCode
      })
    });

    if (response.ok) {
      const data = await response.json();
      statusDiv.innerText = data.message || 'Download initiated.';
      if (data.download_url) {
        downloadLinkDiv.innerHTML = `<a href="${data.download_url}" target="_blank">Download File</a>`;
      }
    } else {
      const errorData = await response.json();
      statusDiv.innerText = `Error: ${errorData.error || 'Failed to initiate download.'}`;
    }
  } catch (error) {
    statusDiv.innerText = `Network error: ${error.message}`;
  }
}
