export type GenerationStatus = "pending" | "processing" | "completed" | "failed";
export type Plan = "free" | "pro" | "business";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan: Plan;
  credits_remaining: number;
  analysis_credits_remaining: number;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Generation = {
  id: string;
  project_id: string;
  user_id: string;
  status: GenerationStatus;
  product_images: string[];
  reference_images: string[];
  user_prompt: string | null;
  enriched_prompt: Record<string, unknown> | null;
  output_ratio: "1:1" | "4:5" | "9:16" | "16:9";
  variations_requested: number;
  cost_credits: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type GeneratedImage = {
  id: string;
  generation_id: string;
  user_id: string;
  image_url: string;
  thumbnail_url: string | null;
  variation_index: number;
  metadata: Record<string, unknown> | null;
  user_rating: number | null;
  is_favorite: boolean;
  is_downloaded: boolean;
  created_at: string;
};

export type StarterReference = {
  id: string;
  category: string;
  image_url: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  created_at: string;
};
