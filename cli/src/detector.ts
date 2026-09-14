import fs from "fs/promises";
import path from "path";

export async function detectFramework(cwd: string): Promise<string> {
  try {
    // Check package.json first
    const packageJsonPath = path.join(cwd, "package.json");
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, "utf8");
      const packageData = JSON.parse(packageJsonContent);

      const dependencies = {
        ...packageData.dependencies,
        ...packageData.devDependencies,
      };

      if (dependencies["next"]) {
        return "next.js";
      }
      if (dependencies["@remix-run/react"]) {
        return "remix";
      }
      if (dependencies["nuxt"]) {
        return "nuxt";
      }
      if (dependencies["vue"]) {
        return "vue";
      }
      if (dependencies["react"]) {
        return "react";
      }
    } catch {
      // Ignored if package.json does not exist or is invalid
    }

    // Check composer.json for PHP/Laravel
    const composerJsonPath = path.join(cwd, "composer.json");
    try {
      const composerContent = await fs.readFile(composerJsonPath, "utf8");
      const composerData = JSON.parse(composerContent);
      const require = {
        ...composerData.require,
        ...composerData["require-dev"],
      };

      if (require["laravel/framework"]) {
        return "laravel";
      }
      if (require["symfony/symfony"]) {
        return "symfony";
      }
    } catch {
      // Ignored
    }

    // Basic Python detection
    const pyprojectPath = path.join(cwd, "pyproject.toml");
    const requirementsPath = path.join(cwd, "requirements.txt");
    try {
      await fs.access(pyprojectPath);
      // It's a python project, maybe we can read django or fastapi later
      // For now, return generic python
      return "python";
    } catch {
      // Ignored
    }

    try {
      await fs.access(requirementsPath);
      return "python";
    } catch {
      // Ignored
    }

    // Go detection
    const goModPath = path.join(cwd, "go.mod");
    try {
      await fs.access(goModPath);
      return "go";
    } catch {
      // Ignored
    }

    return "unknown";
  } catch (error) {
    console.error("Error detecting framework:", error);
    return "unknown";
  }
}
