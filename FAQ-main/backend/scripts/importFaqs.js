const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const FAQ = require("../models/FAQ");

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB Connected");
        importFAQs();
    })
    .catch(err => {
        console.error(err);
    });

const importFAQs = async () => {
    const results = [];

    fs.createReadStream("data/faqs.csv")
        .pipe(csv())
        .on("data", (data) => {
            if (!data.Question || !data.Answer) {
                console.log("Bad Row:", data);
                return;
            }

            results.push({
                question: data.Question.trim(),
                answer: data.Answer.trim(),
                category: "General"
            });
        })
        .on("end", async () => {
            try {
                await FAQ.deleteMany();

                await FAQ.insertMany(results);

                console.log(`${results.length} FAQs imported`);

                process.exit();
            } catch (error) {
                console.error(error);
                process.exit(1);
            }
        });
};
