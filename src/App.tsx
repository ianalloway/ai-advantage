import React from 'react';
import './App.css';

// Updated Data Structure for projects
const projectData = [
  {
    title: "Money-maker-bot",
    description: "Financial intelligence agent forked from OpenClaw/Clawdbot. Built with an 8-component architecture: Brain, Soul, DNA, Muscles, Bones, Eyes, Heartbeat, and Nervous System.",
    tech: ["Python", "OpenClaw", "Anthropic API"],
    link: "#"
  },
  {
    title: "NBA Sports Betting Pipeline",
    description: "XGBoost model hitting 68.3% accuracy with Kelly Criterion bet sizing. Live at aiadvantagesports.com and on Hugging Face.",
    tech: ["Python", "XGBoost", "FastAPI", "Hugging Face"],
    link: "https://aiadvantagesports.com"
  },
  {
    title: "Booperbot",
    description: "Autonomous agent featuring Notion diary integration.",
    tech: ["Python", "LLMs", "Notion API"],
    link: "#"
  },
  {
    title: "Mutant Intelligence",
    description: "AI agent built on MAYC NFT traits. Live at mutantintelligence.com.",
    tech: ["Python", "Web3", "LLMs"],
    link: "https://mutantintelligence.com"
  },
  {
    title: "ClawHub Contributions",
    description: "9 published open-source skills including sports-odds, nft-tracker, data-viz, screenshot-annotator, kelly-criterion, portfolio-rebalancer, market-sentiment, streak-tracker, and devin-integration.",
    tech: ["Python", "OpenClaw", "Open Source"],
    link: "#"
  },
  {
    title: "Job Fit Analyzer",
    description: "FastAPI + React app with regex-based skill extraction, hosted on Devin.",
    tech: ["Python", "FastAPI", "React"],
    link: "#"
  }
];

// Reusable Project Card Component
function ProjectCard({ project }: { project: typeof projectData[number] }) {
  return (
    <div className="project-card">
      <h3>{project.title}</h3>
      <p>{project.description}</p>
      <div className="tech-stack">
        {project.tech.map((techItem, index) => (
          <span key={index} className="tech-tag">{techItem}</span>
        ))}
      </div>
      <a href={project.link} target="_blank" rel="noopener noreferrer">View Project &rarr;</a>
    </div>
  );
}

// Main Application Component
function App() {
  return (
    <div className="portfolio-container">

      {/* Header & Hero Section */}
      <header>
        <h1>Ian Alloway</h1>
        <h2>Machine Learning Engineer & Data Scientist</h2>
        <p>I build robust AI/ML pipelines, predictive models, and full-stack applications. I'm a builder focused on solving real-world problems with data.</p>

        <div className="social-links">
          <a href="https://github.com/ianalloway" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://allowayai.substack.com" target="_blank" rel="noopener noreferrer">Substack</a>
        </div>
      </header>

      {/* Projects Section */}
      <section>
        <h2>Featured Work</h2>
        <div className="projects-grid">
          {projectData.map((project, index) => (
            <ProjectCard key={index} project={project} />
          ))}
        </div>
      </section>

      {/* Contact Section */}
      <footer>
        <h2>Let's Build Something</h2>
        <p>Looking for a data scientist, ML engineer, or research engineer? Reach out directly.</p>
        <a href="mailto:your.email@example.com" className="contact-btn">
          Contact Me
        </a>
      </footer>

    </div>
  );
}

export default App;
