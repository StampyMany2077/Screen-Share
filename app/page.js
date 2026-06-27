'use client';

import { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

export default function ScreenShareApp() {
  const [code, setCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const pusherChannel = useRef(null);
  const localStream = useRef(null);

  // WebRTC Configuration using public STUN servers
  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  // Helper to send signals via Next.js API
  const sendSignal = async (event, data) => {
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/center' },
      body: JSON.stringify({ code: isHost ? code : inputCode, event, data }),
    });
  };

  // Initialize Pusher and WebRTC Peer Connection
  const initWebRTC = (roomCode) => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    });

    pusherChannel.current = pusher.subscribe(`room-${roomCode}`);
    peerConnection.current = new RTCPeerConnection(rtcConfig);

    // Handle ICE Candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('ice-candidate', { candidate: event.candidate, sender: isHost ? 'host' : 'viewer' });
      }
    };
  };

  // --- HOST LOGIC ---
  const startShare = async () => {
    // Generate 8-digit code
    const generatedCode = Math.floor(10000000 + Math.random() * 90000000).toString();
    setCode(generatedCode);
    setIsHost(true);

    initWebRTC(generatedCode);

    try {
      // Capture Screen
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // Add tracks to WebRTC connection
      stream.getTracks().forEach((track) => peerConnection.current.addTrack(track, stream));

      // Listen for viewer signals
      pusherChannel.current.bind('viewer-ready', async () => {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        sendSignal('sdp-offer', { sdp: offer });
      });

      pusherChannel.current.bind('sdp-answer', async (data) => {
        if (data.sender === 'viewer') {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
      });

      pusherChannel.current.bind('ice-candidate', async (data) => {
        if (data.sender === 'viewer' && data.candidate) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      });

    } catch (err) {
      console.error("Error capturing screen: ", err);
    }
  };

  // --- VIEWER LOGIC ---
  const joinShare = async () => {
    if (inputCode.length !== 8) return alert('Please enter a valid 8-digit code');
    setIsViewing(true);

    initWebRTC(inputCode);

    // Listen for remote stream tracks
    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Signaling listeners for Viewer
    pusherChannel.current.bind('sdp-offer', async (data) => {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      sendSignal('sdp-answer', { sdp: answer, sender: 'viewer' });
    });

    pusherChannel.current.bind('ice-candidate', async (data) => {
      if (data.sender === 'host' && data.candidate) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    // Tell the host we are ready to receive the offer
    setTimeout(() => sendSignal('viewer-ready', {}), 1000);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>⚡ Live Screen Share</h1>
      
      {!isHost && !isViewing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '300px', margin: '0 auto' }}>
          <button onClick={startShare} style={{ padding: '10px', fontSize: '16px', cursor: 'pointer' }}>
            Share My Screen
          </button>
          
          <div style={{ borderTop: '1px solid #ccc', paddingTop: '20px' }}>
            <input 
              type="text" 
              maxLength={8} 
              placeholder="Enter 8-digit code" 
              value={inputCode} 
              onChange={(e) => setInputCode(e.target.value)}
              style={{ padding: '10px', width: '70%', marginRight: '10px' }}
            />
            <button onClick={joinShare} style={{ padding: '10px', cursor: 'pointer' }}>Join</button>
          </div>
        </div>
      )}

      {isHost && (
        <div>
          <h2>Your Sharing Code: <span style={{ color: '#0070f3' }}>{code}</span></h2>
          <p>Give this code to anyone who wants to view your screen.</p>
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '80%', maxWidth: '800px', border: '2px solid #333' }} />
        </div>
      )}

      {isViewing && (
        <div>
          <h2>Viewing Stream: {inputCode}</h2>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '80%', maxWidth: '800px', border: '2px solid #0070f3' }} />
        </div>
      )}
    </div>
  );
}