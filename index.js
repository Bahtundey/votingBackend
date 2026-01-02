require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");


const authRoutes = require("./routes/auth");
const pollRoutes = require("./routes/polls");
const contactRoutes = require("./routes/contact");
const exportRoutes = require("./routes/export");
const analyticsRoutes = require("./routes/analytics");


const { schedulePollEnd } = require("./utils/scheduler");
const Poll = require("./models/Poll");



const app = express();
const server = http.createServer(app);


const io = require("socket.io")(server, {
  cors: {
    origin: "https://voting-fronted-wej6.vercel.app",
    credentials: true,
  },
});


app.set("io", io);


app.use(
  cors({
    origin: "https://voting-fronted-wej6.vercel.app",
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));



app.use("/api/auth", authRoutes);
app.use("/api/polls", pollRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/user", require("./routes/user"));



app.get("/", (req, res) => {
  res.json({ ok: true, message: "Voting API running" });
});



io.on("connection", (socket) => {
  console.log(" Client connected:", socket.id);

  socket.on("joinPoll", ({ pollId }) => {
    if (!pollId) return;
    socket.join(pollId);
  });

  socket.on("leavePoll", ({ pollId }) => {
    if (!pollId) return;
    socket.leave(pollId);
  });

  socket.on("disconnect", () => {
    console.log(" Client disconnected:", socket.id);
  });
});


const PORT = process.env.PORT || 4000;

(async function start() {
  try {
    await connectDB(process.env.MONGODB_URI);
    console.log(" MongoDB Connected");

    
    const openPolls = await Poll.find({
      isClosed: false,
      endsAt: { $exists: true },
    });

    for (const poll of openPolls) {
      schedulePollEnd(io, poll);
    }

    server.listen(PORT, () => {
      console.log(` Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error(" Server startup failed:", err);
    process.exit(1);
  }
})();
