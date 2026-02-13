


export default function authLogger(req, res, next) {
  res.on('finish', () => {
    try {
      if (req.method === 'GET' || !req.user) return;
    } catch (err) {
      console.error('authLogger error', err.message);
    }
  });
  next();
}
