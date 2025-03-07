import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Phone, Users } from "lucide-react";

export default function VideoCall() {
  const localVideoRef = useRef(null);
  const websocket = useRef(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const localStream = useRef(null);
  const peerConnections = useRef({});
  const [email, setEmail] = useState("");
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [usersInRoom, setUsersInRoom] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // Initialize WebSocket connection
   
    websocket.current = new WebSocket('https://videocall-webrtc-2k3i.onrender.com');

    websocket.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'all-users':
          console.log("Users in room:", data.users);
          setUsersInRoom(data.users);
          break;
          
        case 'user-joined':
          console.log("User joined:", data.userId);
          createPeerConnection(data.userId);
          setUsersInRoom(prev => [...prev, data.userId]);
          break;
          
        case 'incoming-call':
          console.log("Incoming call from:", data.from);
          if (!peerConnections.current[data.from]) {
            createPeerConnection(data.from);
          }
          await peerConnections.current[data.from].setRemoteDescription(
            new RTCSessionDescription(data.offer)
          );
          const answer = await peerConnections.current[data.from].createAnswer();
          await peerConnections.current[data.from].setLocalDescription(answer);
          websocket.current.send(JSON.stringify({
            type: 'accept-call',
            to: data.from,
            answer
          }));
          break;
          
        case 'call-accepted':
          console.log("Call accepted by:", data.from);
          await peerConnections.current[data.from].setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
          break;
          
        case 'candidate':
          if (peerConnections.current[data.from]) {
            await peerConnections.current[data.from].addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
          }
          break;
          
        case 'user-left':
          console.log("User left:", data.userId);
          if (peerConnections.current[data.userId]) {
            peerConnections.current[data.userId].close();
            delete peerConnections.current[data.userId];
          }
          setRemoteStreams(prev => {
            const updated = { ...prev };
            delete updated[data.userId];
            return updated;
          });
          setUsersInRoom(prev => prev.filter(id => id !== data.userId));
          break;
      }
    };

    return () => {
      if (websocket.current) {
        websocket.current.close();
      }
    };
  }, []);

  const joinRoom = async () => {
    if (!email || !room) return alert("Email and Room are required");
    setConnecting(true);
    
    try {
      websocket.current.send(JSON.stringify({
        type: 'join-room',
        email,
        room
      }));
      
      setJoined(true);
      await startLocalStream();
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Failed to join room. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing media devices:", error);
      alert("Failed to access camera or microphone");
    }
  };

  const createPeerConnection = (userId) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        websocket.current.send(JSON.stringify({
          type: 'candidate',
          to: userId,
          candidate: event.candidate
        }));
      }
    };

    peerConnection.ontrack = (event) => {
      console.log("New track received from user:", userId, event.streams[0]);
    
      setRemoteStreams(prev => ({
        ...prev,
        [userId]: event.streams[0]
      }));
    };
    
  

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => 
        peerConnection.addTrack(track, localStream.current)
      );
    }

    peerConnections.current[userId] = peerConnection;
  };

  const startCall = async (userId) => {
    const peerConnection = peerConnections.current[userId];
    if (!peerConnection) return;
    
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
  
      // Ensure WebSocket is open before sending
      if (websocket.current?.readyState === WebSocket.OPEN) {
        websocket.current.send(JSON.stringify({
          type: 'user-call',
          to: userId,
          offer,
        }));
      } else {
        console.error("WebSocket is not open.");
      }
    } catch (error) {
      console.error("Error starting call:", error);
    }
  };
  

  const endCall = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }

    Object.keys(peerConnections.current).forEach(userId => {
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
      }
    });

    peerConnections.current = {};
    setRemoteStreams({});

    websocket.current.send(JSON.stringify({
      type: 'leave-room',
      email,
      room
    }));

    setJoined(false);
  };

  const toggleAudio = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      {!joined ? (
        <div className="flex justify-center items-center min-h-screen">
          <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full">
            <h1 className="text-3xl font-bold text-center mb-8 text-indigo-600">Join Video Call</h1>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Room</label>
                <input
                  type="text"
                  placeholder="Enter room code"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={joinRoom}
                disabled={connecting}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                {connecting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Users size={20} />
                    <span>Join Room</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="container mx-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-indigo-600">Video Call Room: {room}</h1>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowUserList(!showUserList)}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  <Users size={20} />
                  <span>{usersInRoom.length + 1} Users</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <div className="relative">
                <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
                  />
                  {isVideoOff && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                      <div className="text-white text-xl">Camera Off</div>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                  You (Host)
                </div>
              </div>

              {Object.entries(remoteStreams).map(([userId, stream]) => (
  <div key={userId} className="relative">
    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
      <video
        autoPlay
        playsInline
        ref={(videoRef) => {
          if (videoRef && stream) {
            if (videoRef.srcObject !== stream) {
              videoRef.srcObject = stream; // Ensure the correct stream is assigned
            }
          }
        }}
        className="w-full h-full object-cover"
      />
    </div>
    <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
      User {userId.slice(0, 4)}
    </div>
  </div>
))}

            </div>

            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-white px-6 py-4 rounded-full shadow-lg">
              <button
                onClick={toggleAudio}
                className={`p-4 rounded-full ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {isMuted ? <MicOff className="text-white" /> : <Mic />}
              </button>
              <button
                onClick={toggleVideo}
                className={`p-4 rounded-full ${
                  isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {isVideoOff ? <VideoOff className="text-white" /> : <Video />}
              </button>
              <button
                onClick={endCall}
                className="p-4 rounded-full bg-red-500 hover:bg-red-600"
              >
                <Phone className="text-white" />
              </button>
            </div>

            {showUserList && (
              <div className="fixed right-0 top-0 h-full w-72 bg-white shadow-lg p-6 transform transition-transform">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Users in Room</h2>
                  <button
                    onClick={() => setShowUserList(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">You (Host)</span>
                  </div>
                  {usersInRoom.map((userId) => (
                    <div key={userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span>User {userId.slice(0, 4)}</span>
                      <button
                        onClick={() => startCall(userId)}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                      >
                        Call
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}