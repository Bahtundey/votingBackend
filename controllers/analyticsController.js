const Poll = require("../models/Poll");
const User = require("../models/User");


exports.getPollAnalytics = async (req, res) => {
  try {
    const pollId = req.params.id;

    const poll = await Poll.findById(pollId)
      .populate("votes.user", "name email")
      .lean();

    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }

    
    const totalVotes = poll.votes.length;
    const choiceCount = poll.choices?.length || 0;

const results = Array(choiceCount).fill(0);
const timestamps = Array(choiceCount).fill(null).map(() => []);

poll.votes?.forEach((v) => {
  if (v.choiceIndex < choiceCount) {
    results[v.choiceIndex] += 1;
    timestamps[v.choiceIndex].push(v.votedAt);
  }
});

const percentages = results.map(r =>
  poll.votes.length ? Number(((r / poll.votes.length) * 100).toFixed(1)) : 0
);



    
    const maxVotes = Math.max(...results);
    const topChoices = poll.choices
      .map((c, i) => ({ choice: c.text, votes: results[i] }))
      .filter((c) => c.votes === maxVotes);

   
    const totalUsers = await User.countDocuments();
    const turnoutPercent =
      totalUsers === 0 ? 0 : ((totalVotes / totalUsers) * 100).toFixed(1);

   
    const chartData = {
      labels: poll.choices.map((c) => c.text),
      values: results,
      percentages,
      timestamps,
    };

    return res.json({
      ok: true,
      poll: {
        ...poll,
        results,
        percentages,
        totalVotes,
        totalUsers,
        turnoutPercent,
        topChoices,
        chartData,
      },
    });
  } catch (err) {
    console.error("🔥 ANALYTICS ERROR:", err);
    return res.status(500).json({ error: "Failed to load poll analytics" });
  }
};
