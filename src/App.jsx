import { useRef, useState } from 'react';
import './App.css';

function App() {
  const [stories, setStories] = useState([]);
  const [selectedStory, setSelectedStory] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  
  const fileInputRef = useRef(null);
  const dbRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const autoAdvanceTimerRef = useRef(null);

  // Initialize database
  useState(() => {
    initDatabase();
    
    // Check for old stories every minute
    const cleanupInterval = setInterval(() => {
      fetchAllStories();
    }, 60000); // 60 seconds
    
    return () => clearInterval(cleanupInterval);
  }, []);

  function initDatabase() {
    const request = indexedDB.open('StoriesDB', 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('stories')) {
        db.createObjectStore('stories', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (e) => {
      dbRef.current = e.target.result;
      fetchAllStories();
    };

    request.onerror = () => {
      console.error('Database failed to open');
    };
  }

  function fetchAllStories() {
    if (!dbRef.current) return;

    const transaction = dbRef.current.transaction('stories', 'readonly');
    const store = transaction.objectStore('stories');
    const request = store.getAll();

    request.onsuccess = () => {
      const allStories = request.result;
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      
      // Filter out stories older than 24 hours
      const validStories = allStories.filter(story => {
        const storyAge = now - story.timestamp;
        return storyAge < twentyFourHoursMs;
      });
      
      // If stories were deleted, update the database
      if (validStories.length !== allStories.length) {
        deleteOldStories(allStories, validStories);
      }
      
      setStories(validStories);
      console.log('Loaded stories (old ones deleted):', validStories);
    };
  }

  function deleteOldStories(allStories, validStories) {
    const validIds = validStories.map(s => s.id);
    const oldStories = allStories.filter(s => !validIds.includes(s.id));
    
    const transaction = dbRef.current.transaction('stories', 'readwrite');
    const store = transaction.objectStore('stories');
    
    oldStories.forEach(story => {
      store.delete(story.id);
    });
    
    console.log(`Deleted ${oldStories.length} stories older than 24 hours`);
  }

  function addStory(imageData) {
    if (!dbRef.current) return;

    const transaction = dbRef.current.transaction('stories', 'readwrite');
    const store = transaction.objectStore('stories');
    
    const storyData = {
      image: imageData,
      createdAt: new Date().toISOString(),  // "2024-05-25T14:30:45.123Z"
      timestamp: Date.now()                   // milliseconds since epoch
    };
    
    store.add(storyData);
    setStories([storyData, ...stories]);
  }

  function deleteAllStories() {
    if (!dbRef.current) return;

    const transaction = dbRef.current.transaction('stories', 'readwrite');
    const store = transaction.objectStore('stories');
    store.clear();

    setStories([]);
    setSelectedStory(null);
  }

  function handleAddClick() {
    fileInputRef.current.click();
  }

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      addStory(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function viewStory(index) {
    setSelectedIndex(index);
    setSelectedStory(stories[index]);
    setProgress(0);
    
    // Clear existing timers
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    
    // Progress bar - fills over 3 seconds
    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressIntervalRef.current);
          return 100;
        }
        return prev + (100 / 30); // 30 updates = 3 seconds
      });
    }, 100);
    
    // Auto-advance after 3 seconds
    autoAdvanceTimerRef.current = setTimeout(() => {
      const nextIndex = (index + 1) % stories.length;
      viewStory(nextIndex);
    }, 3000);
  }

  function closeStory() {
    setSelectedStory(null);
    setProgress(0);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
  }

  function goToNextStory() {
    const nextIndex = (selectedIndex + 1) % stories.length;
    viewStory(nextIndex);
  }

  function goToPrevStory() {
    const prevIndex = (selectedIndex - 1 + stories.length) % stories.length;
    viewStory(prevIndex);
  }

  function handleTouchStart(e) {
    setTouchStart(e.touches[0].clientX);
  }

  function handleTouchEnd(e) {
    if (!touchStart) return;
    
    const touchEnd = e.changedTouches[0].clientX;
    const swipeDistance = touchStart - touchEnd;
    const swipeThreshold = 50; // minimum distance to register as swipe
    
    if (swipeDistance > swipeThreshold) {
      // Swiped left - go to next story
      goToNextStory();
    } else if (swipeDistance < -swipeThreshold) {
      // Swiped right - go to previous story
      goToPrevStory();
    }
    
    setTouchStart(null);
  }

  // Format time nicely - Relative time (Now, Xm ago, Xh ago, etc)
  function getRelativeTime(isoString) {
    const now = new Date();
    const storyTime = new Date(isoString);
    const diffMs = now - storyTime;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if(diffSeconds<5){
      return 'Now'
    }
    else if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }

  function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString(); // "5/25/2024, 2:30:45 PM"
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <h1 className="text-3xl font-bold mb-8 text-center">My Stories</h1>

      {/* Stories Container */}
      <div className="max-w-2xl mx-auto">
        {/* Stories Bar */}
        <div className="bg-white border-2 border-gray-300 rounded-2xl p-4 flex gap-3 overflow-x-auto shadow-md">
          {/* Add Story Button */}
          <button
            onClick={handleAddClick}
            className="w-20 h-20 min-w-max bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-3xl font-bold hover:shadow-lg transition-shadow"
          >
            +
          </button>

          {/* Story Thumbnails with Time */}
          {stories.map((story, index) => (
            <div key={story.id} className="flex flex-col items-center gap-1">
              <button
                onClick={() => viewStory(index)}
                className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-colors hover:shadow-lg"
              >
                <img
                  src={story.image}
                  alt={`Story ${story.id}`}
                  className="w-full h-full object-cover"
                />
              </button>
              <span className="text-xs text-gray-500">{getRelativeTime(story.createdAt)}</span>
            </div>
          ))}
        </div>

        {/* Story Count */}
        <p className="text-center mt-4 text-gray-600">
          {stories.length} {stories.length === 1 ? 'story' : 'stories'}
        </p>

        {/* Actions */}
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={deleteAllStories}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
          >
            Delete All
          </button>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Story Viewer Modal */}
      {selectedStory && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Progress Bar - All Stories */}
          <div className="absolute top-0 left-0 right-0 flex gap-1 bg-black bg-opacity-30 p-1 z-20">
            {stories.map((_, index) => (
              <div
                key={index}
                className="flex-1 h-1 bg-gray-600 rounded-full overflow-hidden"
              >
                {/* Fill animation only for current story */}
                {index === selectedIndex && (
                  <div
                    className="h-full bg-white"
                    style={{ width: `${progress}%`, transition: 'width 0.1s linear' }}
                  />
                )}
                {/* Full fill for completed stories */}
                {index < selectedIndex && (
                  <div className="h-full bg-white" />
                )}
              </div>
            ))}
          </div>

          {/* Close Button */}
          <button
            onClick={closeStory}
            className="absolute top-6 right-6 text-white text-4xl font-bold hover:text-gray-300 transition-colors z-10"
          >
            ✕
          </button>

          {/* Image */}
          <img
            src={selectedStory.image}
            alt="Story Viewer"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />

          {/* Story Info - Time */}
          <div className="absolute top-6 left-6 bg-black bg-opacity-70 text-white px-4 py-3 rounded-lg">
            <p className="font-semibold">Created at:</p>
            <p className="text-sm">{formatTime(selectedStory.createdAt)}</p>
          </div>

          {/* Navigation Arrows */}
          {stories.length > 1 && (
            <>
              <button
                onClick={goToPrevStory}
                className="absolute left-6 text-white text-5xl hover:text-gray-300 transition-colors select-none active:text-yellow-300"
              >
                ‹
              </button>
              <button
                onClick={goToNextStory}
                className="absolute right-6 text-white text-5xl hover:text-gray-300 transition-colors select-none active:text-yellow-300"
              >
                ›
              </button>
            </>
          )}

          {/* Story Counter */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-white text-lg font-medium bg-black bg-opacity-50 px-4 py-2 rounded-full">
            {selectedIndex + 1} / {stories.length}
          </div>

          {/* Swipe Instructions */}
          <div className="absolute top-1/2 text-white text-sm opacity-50 pointer-events-none">
            👈 Swipe or tap arrows 👉
          </div>
        </div>
      )}
    </div>
  );
}

export default App;