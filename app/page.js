const Pusher = require('pusher');

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { code, event, data } = req.body;

    // Broadcast the exact data payload to the room
    await pusher.trigger(`room-${code}`, event, data);

    return res.status(200).json({ success: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
};