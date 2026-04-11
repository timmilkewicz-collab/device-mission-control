import { TaskDefinition } from "../shared/types";

export const baseTaskCatalog: TaskDefinition[] = [
  {
    id: "collect_now",
    title: "Collect observation now",
    description: "Capture a fresh observation immediately and send it to the hub.",
    requiresApproval: false,
    platforms: ["windows", "linux"]
  },
  {
    id: "capture_screenshot",
    title: "Capture screenshot",
    description: "Capture a screenshot using the device-local screenshot provider.",
    requiresApproval: true,
    platforms: ["windows", "linux"]
  },
  {
    id: "show_home_directory",
    title: "Open home directory",
    description: "Open the current user's home directory on the local machine.",
    requiresApproval: true,
    platforms: ["windows", "linux"]
  },
  {
    id: "show_workspace_root",
    title: "Open configured workspace root",
    description: "Open the configured mission-control workspace root if one is set.",
    requiresApproval: true,
    platforms: ["windows", "linux"]
  }
];
