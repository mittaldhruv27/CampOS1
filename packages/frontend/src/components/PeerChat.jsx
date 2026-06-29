import React, { useState, useEffect, useRef } from 'react';
import { Smiley, Paperclip, Microphone, PaperPlaneRight, Checks, ArrowsCounterClockwise, CaretLeft, Trash, Image, FileText, MapPin, Flag, Chats } from '@phosphor-icons/react';
import { API_BASE } from '../config/api';

export default function PeerChat({ currentUser, initialActivePeer, onClose }) {
  // Sender name determination (using first name consistently for gig board compatibility)
  const senderName = currentUser ? currentUser.firstName : 'Sanya';

  const [activePeer, setActivePeer] = useState(initialActivePeer || 'Kunal');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }
  
  // Custom dialog state for reporting chats (replaces browser window.prompt)
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  // Started chats tracker to check if we accepted their listing
  const [startedChats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cp_started_chats') || '[]');
    } catch (e) {
      return [];
    }
  });

  // Cache of avatars: Map of firstName -> avatar
  const [avatars, setAvatars] = useState(() => {
    try {
      const cached = localStorage.getItem('cp_all_users_avatars');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/avatars`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setAvatars(data);
          localStorage.setItem('cp_all_users_avatars', JSON.stringify(data));
        }
      } catch (err) {
        console.warn('Failed to fetch avatars:', err);
      }
    };
    fetchAvatars();
    const interval = setInterval(fetchAvatars, 30000);
    return () => clearInterval(interval);
  }, []);

  const renderAvatar = (name, sizeClass = "w-8 h-8 text-xs") => {
    const av = avatars[name.trim().toLowerCase()];
    if (av) {
      return (
        <img 
          src={av} 
          alt={name} 
          className={`${sizeClass} rounded-full object-cover shadow-inner border border-m3-outlineVariant/20 shrink-0`}
        />
      );
    }
    const firstLetter = name.charAt(0).toUpperCase();
    return (
      <div className={`${sizeClass} ${getAvatarBg(name)} rounded-full flex items-center justify-center font-bold shadow-inner border border-m3-outlineVariant/10 shrink-0`}>
        {firstLetter}
      </div>
    );
  };

  // Emojis Picker State (disabled)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const commonEmojis = [];

  // Attachment Menu State
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const fileInputRef = useRef(null);
  const [fileTypeAccept, setFileTypeAccept] = useState('image/*');

  // Real Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingIntervalRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Helper to color circles dynamically using Material 3 container palette
  const getAvatarBg = (name) => {
    const letter = name.charAt(0).toUpperCase();
    if (letter === 'V' || letter === 'S') return 'bg-m3-primaryContainer text-m3-onPrimaryContainer';
    if (letter === 'K' || letter === 'R') return 'bg-m3-surfaceContainerHighest text-m3-primary';
    if (letter === 'D' || letter === 'A') return 'bg-m3-tertiaryContainer text-m3-onTertiaryContainer';
    return 'bg-m3-secondaryContainer text-m3-onSecondaryContainer';
  };

  const fetchChatHistory = async (peerName) => {
    try {
      const res = await fetch(`${API_BASE}/api/messages?userA=${encodeURIComponent(senderName)}&userB=${encodeURIComponent(peerName)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load chat history');
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      // Fail silently for interval updates
    }
  };

  const [ownGigId, setOwnGigId] = useState(null);
  const [ownGigStatus, setOwnGigStatus] = useState(null);
  const [peerGigId, setPeerGigId] = useState(null);
  const [peerGigStatus, setPeerGigStatus] = useState(null);

  const fetchGigsInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/skillgigs`, { credentials: 'include' });
      if (res.ok) {
        const gigs = await res.json();
        
        // Find current user's active/ongoing gig (if any) with this peer
        const ownGig = gigs.find(
          g => g.StudentName.toLowerCase() === currentUser?.firstName?.toLowerCase() && 
          (g.Status === 'Active' || (g.Status === 'Ongoing' && g.SwappedWith?.toLowerCase() === activePeer.toLowerCase()))
        );
        if (ownGig) {
          setOwnGigId(ownGig.id || ownGig._id);
          setOwnGigStatus(ownGig.Status);
        } else {
          setOwnGigId(null);
          setOwnGigStatus(null);
        }

        // Find activePeer's active/ongoing gig (if any) with current user
        const peerGig = gigs.find(
          g => g.StudentName.toLowerCase() === activePeer.toLowerCase() && 
          (g.Status === 'Active' || (g.Status === 'Ongoing' && g.SwappedWith?.toLowerCase() === currentUser?.firstName?.toLowerCase()))
        );
        if (peerGig) {
          setPeerGigId(peerGig.id || peerGig._id);
          setPeerGigStatus(peerGig.Status);
        } else {
          setPeerGigId(null);
          setPeerGigStatus(null);
        }
      }
    } catch (e) {
      // Fail silently
    }
  };

  useEffect(() => {
    if (currentUser?.firstName && activePeer) {
      fetchGigsInfo();
    }
  }, [currentUser, activePeer]);

  const handleConfirmSwap = () => {
    if (!ownGigId) return;

    setConfirmDialog({
      message: `Confirm skill swap with ${activePeer}? This will hide the listing from the board for everyone else and start your ongoing swap.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/skillgigs/${ownGigId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              Status: 'Ongoing',
              SwappedWith: activePeer,
            }),
            credentials: 'include',
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || 'Failed to confirm swap');
          }

          alert(`Skill swap with ${activePeer} confirmed successfully!`);
          fetchGigsInfo();
        } catch (err) {
          alert(err.message);
        }
      }
    });
  };

  const handleLeaveChat = () => {
    setConfirmDialog({
      message: `Leave chat with ${activePeer}? This will delete the discussion history and remove the chat from your active chats.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/messages/conversation?partner=${encodeURIComponent(activePeer)}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || 'Failed to delete conversation');
          }

          const currentStarted = JSON.parse(localStorage.getItem('cp_started_chats') || '[]');
          const updated = currentStarted.filter(name => name.toLowerCase() !== activePeer.toLowerCase());
          localStorage.setItem('cp_started_chats', JSON.stringify(updated));

          alert(`Left chat with ${activePeer} and deleted discussion history.`);
          if (onClose) onClose();
        } catch (e) {
          alert(e.message);
        }
      }
    });
  };

  const handleEndSwap = () => {
    const targetGigId = ownGigId || peerGigId;
    if (!targetGigId) return;

    setConfirmDialog({
      message: `End this skill swap? This will close the chat conversation and add the swap to your completed History.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/skillgigs/${targetGigId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              Status: 'Completed',
            }),
            credentials: 'include',
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || 'Failed to end swap');
          }

          alert('Skill swap ended successfully! It has been moved to your History tab.');
          if (onClose) onClose();
        } catch (err) {
          alert(err.message);
        }
      }
    });
  };

  const handleReportChat = () => {
    setShowReportDialog(true);
    setReportReason('');
  };

  const submitReportChat = async () => {
    if (!reportReason.trim()) return;
    try {
      setSubmittingReport(true);
      const res = await fetch(`${API_BASE}/api/messages/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ReportedName: activePeer,
          Reason: reportReason.trim(),
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to report chat');
      }

      setShowReportDialog(false);
      setReportReason('');
      alert('Thank you. The chat has been reported to the administrators.');
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingReport(false);
    }
  };

  // Fetch initial chat logs on component load and peer change
  useEffect(() => {
    if (!activePeer) return;

    setLoading(true);
    fetchChatHistory(activePeer).then(() => setLoading(false));

    // Poll message logs every 4 seconds to mock socket real-time streams
    const pollingInterval = setInterval(() => {
      fetchChatHistory(activePeer);
    }, 4000);

    return () => clearInterval(pollingInterval);
  }, [activePeer, senderName]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const messageText = inputText.trim();
    setInputText(''); // Reset input immediately for visual responsiveness

    try {
      // Optimistic local state update to make interface feel instantaneous
      const tempMessage = {
        SenderName: senderName,
        ReceiverName: activePeer,
        Content: messageText,
        Timestamp: new Date(),
        _id: 'temp-' + Date.now(),
      };
      setMessages((prev) => [...prev, tempMessage]);

      const res = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          SenderName: senderName,
          ReceiverName: activePeer,
          Content: messageText,
        }),
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to deliver message');
      
      // Refresh chat from DB to sync correct timestamps and IDs
      fetchChatHistory(activePeer);
    } catch (err) {
      alert(err.message);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const formatRecordingTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleEmojiClick = (emoji) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // Real Attachment handlers (using browser FileReader)
  const triggerFileSelect = (acceptType) => {
    setFileTypeAccept(acceptType);
    setShowAttachmentMenu(false);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (max 5MB for safe database transmission)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be under 5MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64Data = reader.result;
      
      try {
        const tempMessage = {
          SenderName: senderName,
          ReceiverName: activePeer,
          Content: base64Data,
          Timestamp: new Date(),
          _id: 'temp-' + Date.now(),
        };
        setMessages((prev) => [...prev, tempMessage]);

        await fetch(`${API_BASE}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            SenderName: senderName,
            ReceiverName: activePeer,
            Content: base64Data,
          }),
          credentials: 'include',
        });
        fetchChatHistory(activePeer);
      } catch (err) {
        alert(err.message);
      }
    };
    e.target.value = '';
  };

  const sendLocation = () => {
    setShowAttachmentMenu(false);
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      
      try {
        const tempMessage = {
          SenderName: senderName,
          ReceiverName: activePeer,
          Content: mapsUrl,
          Timestamp: new Date(),
          _id: 'temp-' + Date.now(),
        };
        setMessages((prev) => [...prev, tempMessage]);

        await fetch(`${API_BASE}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            SenderName: senderName,
            ReceiverName: activePeer,
            Content: mapsUrl,
          }),
          credentials: 'include',
        });
        fetchChatHistory(activePeer);
      } catch (err) {
        alert(err.message);
      }
    }, (err) => {
      alert('Could not retrieve location: ' + err.message);
    });
  };

  // Real Audio Recording handlers (using MediaRecorder API)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Release microphone resources
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          
          try {
            const tempMessage = {
              SenderName: senderName,
              ReceiverName: activePeer,
              Content: base64Audio,
              Timestamp: new Date(),
              _id: 'temp-' + Date.now(),
            };
            setMessages((prev) => [...prev, tempMessage]);

            await fetch(`${API_BASE}/api/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                SenderName: senderName,
                ReceiverName: activePeer,
                Content: base64Audio,
              }),
              credentials: 'include',
            });
            fetchChatHistory(activePeer);
          } catch (err) {
            alert(err.message);
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Could not access microphone: ' + err.message);
    }
  };

  const stopAndSendRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        // Discard buffers and stop tracks
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    setIsRecording(false);
    setRecordingTime(0);
  };

  const handleMicClick = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      handleSendMessage();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  // Multi-type message content renderer helper
  const renderMessageContent = (content, isSentByMe) => {
    if (content.startsWith('data:image/')) {
      return (
        <div className="py-1">
          <img 
            src={content} 
            className="rounded-xl max-w-[200px] max-h-[200px] object-cover border border-m3-onSurfaceVariant/20 shadow-sm" 
            alt="Sent attachment" 
          />
        </div>
      );
    }
    if (content.startsWith('data:audio/')) {
      return (
        <div className="py-1.5 flex items-center pr-1">
          <audio 
            src={content} 
            controls 
            className="w-[190px] h-8 rounded-full focus:outline-none" 
            style={{ filter: 'invert(1) hue-rotate(180deg) contrast(90%)' }}
          />
        </div>
      );
    }
    if (content.startsWith('data:application/') || content.startsWith('data:text/') || content.startsWith('data:message/')) {
      return (
        <a 
          href={content} 
          download="attachment" 
          className="flex items-center gap-2 text-m3-primary hover:text-m3-onPrimaryContainer underline font-bold text-xs py-1"
        >
          <FileText size={16} />
          <span>Download Document</span>
        </a>
      );
    }
    if (content.startsWith('https://www.google.com/maps')) {
      return (
        <a 
          href={content} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="flex items-center gap-2 text-m3-primary hover:text-m3-onPrimaryContainer underline font-bold text-xs py-1"
        >
          <MapPin size={16} />
          <span>View Shared Location</span>
        </a>
      );
    }
    return (
      <p className={`m3-body-medium ${isSentByMe ? '!text-white' : '!text-m3-onSurface'} leading-relaxed break-words pr-1`}>
        {content}
      </p>
    );
  };

  const hasConfirmSwap = ownGigId && ownGigStatus === 'Active';
  const hasLeaveChat = peerGigId && peerGigStatus === 'Active';
  const hasEndSwap = ownGigStatus === 'Ongoing' || peerGigStatus === 'Ongoing';
  const hasActionButtons = hasConfirmSwap || hasLeaveChat || hasEndSwap;

  return (
    <div className="m3-screen peer-chat-container !h-full !max-h-full !border-none !rounded-none flex flex-col justify-between relative overflow-hidden !bg-m3-surface">
      
      {/* Hidden file input for attachments */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange}
        accept={fileTypeAccept}
        className="hidden"
      />

      {/* M3 Header Top Bar */}
      <header 
        className="m3-top-app-bar m3-top-app-bar--collapsed z-[100] shrink-0" 
        style={{ 
          height: hasActionButtons ? '138px' : '96px', 
          paddingTop: '26px',
          transition: 'height 0.2s var(--m3-ease-standard)'
        }}
      >
        <div className="m3-top-app-bar__row w-full justify-between pr-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
            <button
              onClick={onClose}
              className="m3-icon-button"
              type="button"
              aria-label="Go back"
            >
              <CaretLeft size={22} strokeWidth={2.5} />
            </button>
            
            {renderAvatar(activePeer, "w-9 h-9 text-sm shrink-0")}
            <h4 className="m3-title-medium text-m3-onSurface leading-none pl-1 truncate min-w-0">{activePeer}</h4>
          </div>
          
          <div className="flex items-center shrink-0">
            <button
              onClick={handleReportChat}
              className="w-8 h-8 rounded-full hover:bg-m3-surfaceContainerHighest text-m3-onSurfaceVariant hover:text-m3-error flex items-center justify-center transition cursor-pointer border-none bg-transparent"
              title="Report Chat"
              type="button"
            >
              <Flag size={18} />
            </button>
          </div>
        </div>

        {hasActionButtons && (
          <div 
            className="flex items-center justify-end gap-2 w-full pr-2 mt-1.5 h-10"
            style={{ animation: 'fadeIn 0.2s cubic-bezier(0.2, 0, 0, 1)' }}
          >
            {hasConfirmSwap && (
              <button
                onClick={handleConfirmSwap}
                className="bg-m3-primary text-m3-onPrimary hover:brightness-110 active:scale-95 font-bold px-3.5 py-1.5 rounded-full text-[9px] uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-sm shrink-0" data-haptic="medium"
              >
                Confirm Swap
              </button>
            )}

            {hasLeaveChat && (
              <button
                onClick={handleLeaveChat}
                className="bg-m3-surfaceContainerHighest text-m3-onSurfaceVariant hover:bg-m3-error hover:text-m3-onError active:scale-95 font-bold px-3.5 py-1.5 rounded-full text-[9px] uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-sm shrink-0 border border-m3-outline-variant/30" data-haptic="medium"
              >
                Leave Chat
              </button>
            )}

            {hasEndSwap && (
              <button
                onClick={handleEndSwap}
                className="bg-m3-errorContainer text-m3-onErrorContainer hover:brightness-110 active:scale-95 font-bold px-3.5 py-1.5 rounded-full text-[9px] uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-sm shrink-0" data-haptic="medium"
              >
                End Swap
              </button>
            )}
          </div>
        )}
      </header>

      {/* Message Scroller Body */}
      <div 
        className="flex-1 overflow-y-auto scrollbar-none p-4 bg-transparent flex flex-col gap-3 min-h-0"
        style={{
          paddingTop: hasActionButtons ? '148px' : '106px',
          paddingBottom: '88px',
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 0)',
          backgroundSize: '24px 24px',
          transition: 'padding-top 0.2s var(--m3-ease-standard)'
        }}
      >
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3.5 select-none py-16 text-center">
            <ArrowsCounterClockwise className="animate-spin text-m3-primary" size={28} />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Syncing messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center gap-3 text-center select-none py-16">
            <div 
              className="w-16 h-16 rounded-3xl flex items-center justify-center text-m3-primary shadow-md"
              style={{ backgroundColor: 'color-mix(in srgb, var(--m3-primary-container) 30%, transparent)' }}
            >
              <Chats size={32} />
            </div>
            <h4 className="m3-title-medium text-m3-onSurface mt-2">Start a conversation with {activePeer}!</h4>
            <p className="m3-body-small text-m3-onSurfaceVariant max-w-[240px]">Say hello to begin sharing peer skills on CampOS.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex justify-center my-2">
              <span className="m3-badge bg-m3-surfaceContainerHigh text-m3-onSurfaceVariant text-[9px] uppercase tracking-wider">
                Today
              </span>
            </div>
            
            {messages.map((msg) => {
              const isSentByMe = msg.SenderName === senderName;
              return (
                <div
                  key={msg._id}
                  className={`flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-0.5`}
                >
                  {isSentByMe ? (
                    <div className="max-w-[75%] bg-m3-primaryContainer text-m3-onPrimaryContainer rounded-[20px] rounded-tr-none px-4 py-2.5 text-left flex flex-col shadow-sm relative pr-14 min-w-[70px]">
                      {renderMessageContent(msg.Content, true)}
                      <div className="flex items-center justify-end gap-0.5 text-[9px] text-m3-onPrimaryContainer/60 select-none absolute bottom-1 right-3">
                        <span>{formatTime(msg.Timestamp || msg.createdAt)}</span>
                        <Checks size={12} className="text-m3-onPrimaryContainer/80" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2 max-w-[75%]">
                      {renderAvatar(activePeer, "w-8 h-8 text-xs shrink-0 mb-0.5")}
                      <div className="flex-1 bg-m3-surfaceContainer text-m3-onSurface rounded-[20px] rounded-tl-none px-4 py-2.5 text-left flex flex-col shadow-sm relative pr-12 min-w-[70px]">
                        {renderMessageContent(msg.Content, false)}
                        <span className="text-[9px] text-m3-onSurfaceVariant/60 font-sans text-right select-none absolute bottom-1 right-3">
                          {formatTime(msg.Timestamp || msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Emoji Picker Overlay Removed */}

      {/* Attachment Menu Overlay */}
      {showAttachmentMenu && (
        <div className="absolute bottom-16 left-12 z-50 p-2 rounded-[24px] bg-m3-surfaceContainer border border-transparent shadow-lg flex flex-col gap-1 min-w-[150px]">
          <button
            type="button"
            onClick={() => triggerFileSelect('image/*')}
            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-m3-surfaceContainerHighest active:scale-95 text-left text-xs font-semibold text-m3-onSurface transition-all cursor-pointer" data-haptic="medium"
          >
            <Image size={15} className="text-m3-primary" />
            <span>Photo / Image</span>
          </button>
          <button
            type="button"
            onClick={() => triggerFileSelect('application/pdf,text/plain')}
            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-m3-surfaceContainerHighest active:scale-95 text-left text-xs font-semibold text-m3-onSurface transition-all cursor-pointer" data-haptic="medium"
          >
            <FileText size={15} className="text-m3-primary" />
            <span>Document</span>
          </button>
          <button
            type="button"
            onClick={sendLocation}
            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-m3-surfaceContainerHighest active:scale-95 text-left text-xs font-semibold text-m3-onSurface transition-all cursor-pointer" data-haptic="medium"
          >
            <MapPin size={15} className="text-m3-primary" />
            <span>Location</span>
          </button>
        </div>
      )}

      {/* Message input field bar */}
      <form onSubmit={handleSendMessage} className="absolute bottom-0 left-0 right-0 flex items-center gap-2.5 py-4 px-4 z-10 shrink-0" style={{ backgroundColor: 'var(--m3-surface)', borderTop: '1px solid var(--m3-surface-container-highest)' }}>
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between bg-m3-surfaceContainer rounded-full h-[48px] px-4">
            <div className="flex items-center gap-2 text-m3-error">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
              <span className="text-xs font-bold font-mono">Recording: {formatRecordingTime(recordingTime)}</span>
            </div>
            
            {/* Audio wave visualizer simulation */}
            <div className="flex items-center gap-0.5 pr-2">
              <div className="w-0.5 h-2 bg-m3-primary rounded-full animate-pulse" />
              <div className="w-0.5 h-4 bg-m3-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-0.5 h-3 bg-m3-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              <div className="w-0.5 h-5 bg-m3-primary rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
              <div className="w-0.5 h-2 bg-m3-primary rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="w-8 h-8 rounded-full text-m3-error active:scale-95 flex items-center justify-center transition-all cursor-pointer" data-haptic="medium"
                style={{ backgroundColor: 'color-mix(in srgb, var(--m3-error-container) 20%, transparent)' }}
                title="Cancel Recording"
              >
                <Trash size={15} />
              </button>
              <button
                type="button"
                onClick={stopAndSendRecording}
                className="w-8 h-8 rounded-full bg-m3-primary text-m3-onPrimary hover:brightness-110 active:scale-95 flex items-center justify-center transition-all cursor-pointer" data-haptic="medium"
                title="Send Voice Note"
              >
                <PaperPlaneRight size={14} className="translate-x-[0.5px]" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Emoji button removed */}
            <button
              type="button"
              onClick={() => { setShowAttachmentMenu(!showAttachmentMenu); setShowEmojiPicker(false); }}
              className={`text-m3-onSurfaceVariant hover:text-m3-onSurface p-1 transition-colors cursor-pointer shrink-0 ${showAttachmentMenu ? 'text-m3-primary' : ''}`}
            >
              <Paperclip size={20} />
            </button>
            
            <input
              type="text"
              className="flex-1 m3-filled-field !h-[48px] text-sm !rounded-full !px-4"
              placeholder="Type a message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              required
            />
            
            <button 
              type="button"
              onClick={handleMicClick}
              className="w-12 h-12 rounded-full bg-m3-primary text-m3-onPrimary hover:brightness-110 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0" data-haptic="medium"
            >
              {inputText.trim() ? (
                <PaperPlaneRight size={18} className="translate-x-[1px]" />
              ) : (
                <Microphone size={18} />
              )}
            </button>
          </>
        )}
      </form>

      {/* Custom Confirm Dialog */}
      {confirmDialog && (
        <div className="absolute inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4">
          <div className="m3-frosted-dialog p-6 flex flex-col gap-4 text-left max-w-[280px] w-full shadow-2xl animate-fade-in animate-none">
            <h3 className="m3-title-medium text-m3-onSurface">Confirm Action</h3>
            <p className="m3-body-small text-m3-onSurfaceVariant">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2.5 mt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="m3-filled-button bg-m3-surfaceVariant text-m3-onSurfaceVariant !min-h-[36px] text-xs !py-1 px-3 w-auto"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="m3-filled-button bg-m3-primary text-m3-onPrimary !min-h-[36px] text-xs !py-1 px-3 w-auto"
                type="button"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Report Dialog */}
      {showReportDialog && (
        <div className="absolute inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4">
          <div className="m3-frosted-dialog p-6 flex flex-col gap-4 text-left max-w-[280px] w-full shadow-2xl animate-fade-in">
            <h3 className="m3-title-medium text-m3-onSurface">Report Chat</h3>
            <p className="m3-body-small text-m3-onSurfaceVariant">
              Please enter the reason for reporting this chat with {activePeer}:
            </p>
            <textarea
              className="m3-filled-field !h-20 text-xs !rounded-xl !p-3 resize-none border-none"
              placeholder="Inappropriate content, spam, etc..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2.5 mt-2">
              <button
                onClick={() => { setShowReportDialog(false); setReportReason(''); }}
                className="m3-filled-button bg-m3-surfaceVariant text-m3-onSurfaceVariant !min-h-[36px] text-xs !py-1 px-3 w-auto"
                type="button"
                disabled={submittingReport}
              >
                Cancel
              </button>
              <button
                onClick={submitReportChat}
                className="m3-filled-button bg-m3-primary text-m3-onPrimary !min-h-[36px] text-xs !py-1 px-3 w-auto border-none"
                type="button"
                disabled={submittingReport || !reportReason.trim()}
              >
                {submittingReport ? 'Reporting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
// PeerChat component - peer messaging UI

const MessageBubble = ({ message, isSender }) => (
  <div className={`flex ${isSender ? "justify-end" : "justify-start"} mb-2`}>
    <div className={`px-4 py-2 rounded-2xl max-w-xs ${isSender ? "bg-violet-500 text-white" : "bg-white/10 text-gray-200"}`}>
      {message.text}
    </div>
  </div>
);
