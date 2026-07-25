export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface Job {
  id: string;
  product_name: string;
  description: string;
  reference_image_url: string | null;
  generated_prompt: string | null;
  result_image_url: string | null;
  status: JobStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
