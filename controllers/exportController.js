const Poll = require("../models/Poll");
const PDFDocument = require("pdfkit");
const { Parser } = require("json2csv");



exports.exportCSV = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }

    const rows = poll.choices.map((choice, index) => ({
      choice: choice.text,
      votes: poll.votes.filter(v => v.choiceIndex === index).length,
    }));

    const parser = new Parser();
    const csv = parser.parse(rows);

    res.header("Content-Type", "text/csv");
    res.header("Content-Disposition", `attachment; filename=poll-${poll._id}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error("CSV Export Error:", err);
    res.status(500).json({ error: "CSV export failed" });
  }
};



exports.exportPDF = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }

    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=poll-${poll._id}.pdf`
    );

    doc.pipe(res);

    
    doc.fontSize(20).text(poll.title, { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Description: ${poll.description}`);
    doc.moveDown();

    doc.text("Results:", { bold: true });
    doc.moveDown();

    poll.choices.forEach((choice, index) => {
      const count = poll.votes.filter((v) => v.choiceIndex === index).length;
      doc.text(`${choice.text}: ${count} votes`);
    });

    doc.end();
  } catch (err) {
    console.error("PDF Export Error:", err);
    res.status(500).json({ error: "PDF export failed" });
  }
};
