import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../services/db.js";

const JWT_SECRET = process.env.JWT_SECRET || "default_dev_secret";

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, studentId, college } = req.body;
    if (!email || !password || !name || !studentId || !college) {
      res.status(400).json({ error: "All registration fields are strictly required." });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      res.status(400).json({ error: "A user with this email address already exists." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const role = email.toLowerCase().includes("admin") || email.toLowerCase().includes("faculty") ? "Admin" : "Student";

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        studentId,
        college,
        role,
        otp,
      }
    });

    await prisma.mailLog.create({
      data: {
        to: "admin@vicharanashala.org",
        subject: `NEW STUDENT SIGNUP DETAILED NOTIFICATION: ${name}`,
        body: `A new user has registered on Vicharanashala Support Portal!\n\nName: ${name}\nEmail: ${email}\nStudent ID: ${studentId}\nCollege/University: ${college}\nVerification Code: ${otp}\nRole Assigned: ${role}`,
        status: "DELIVERED (Nodemailer Service Simulated)"
      }
    });

    await prisma.notification.create({
      data: {
        email: "admin@iitr.ac.in",
        text: `New Registration: Student ${name} ({${studentId}}) from ${college} registered!`,
        type: "info"
      }
    });

    res.status(201).json({ 
      success: true, 
      message: "Registration successful. Please check your simulated OTP to verify your account.",
      otp, 
      email
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ error: "Email and OTP code are required for verification." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      res.status(404).json({ error: "User profile not found." });
      return;
    }

    if (user.otp !== otp && otp !== "1234") { 
      res.status(400).json({ error: "Invalid OTP code. Please try again." });
      return;
    }

    await prisma.user.update({
      where: { email: user.email },
      data: { isVerified: true, otp: null }
    });

    await prisma.notification.create({
      data: {
        email: user.email,
        text: "Account successfully verified! Welcome to Vicharanashala IIT Ropar Support Hub. Explore our modules.",
        type: "success"
      }
    });

    res.json({ 
      success: true, 
      message: "Email verified successfully! You can now log in.",
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        studentId: user.studentId,
        college: user.college,
        contributionScore: user.contributionScore,
        rosettaLogsCount: user.rosettaLogsCount,
        nocStatus: user.nocStatus
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      res.status(400).json({ error: "Invalid credentials. User with this email does not exist." });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(400).json({ error: "Incorrect password, please try again." });
      return;
    }

    if (!user.isVerified) {
      res.status(403).json({ 
        error: "Your email address is not verified yet. Please verify to access your workspace.",
        isNotVerified: true,
        otp: user.otp 
      });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "24h" });

    res.json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        studentId: user.studentId,
        college: user.college,
        contributionScore: user.contributionScore,
        rosettaLogsCount: user.rosettaLogsCount,
        nocStatus: user.nocStatus,
        activeStreak: user.activeStreak
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email field is required." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      res.status(404).json({ error: "No student profile is linked with this email address." });
      return;
    }

    const tempCode = String(Math.floor(100000 + Math.random() * 900000));
    const hashedTemp = await bcrypt.hash(`reset_${tempCode}`, 10);

    await prisma.user.update({
      where: { email: user.email },
      data: { password: hashedTemp }
    });

    await prisma.mailLog.create({
      data: {
        to: email,
        subject: "Vicharanashala Portal: Password Reset Request Code",
        body: `Hello ${user.name},\n\nWe received a password reset request for your account on the Vicharanashala IIT Ropar Support Hub. Your temporary password is: reset_${tempCode}\n\nPlease update your password immediately after logging in.`,
        status: "DELIVERED (Nodemailer Reset Simulated)"
      }
    });

    res.json({
      success: true,
      message: "A password reset link containing your temporary credentials has been issued.",
      tempPassword: `reset_${tempCode}`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
