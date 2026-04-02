import { z } from 'zod';

export const publishCastSchema = z.object({
  text: z
    .string({ error: 'Text is required' })
    .min(1, 'Text is required')
    .max(320, 'Cast text exceeds 320 character limit'),
  embeds: z.array(z.string().url()).max(2).optional(),
});

export type PublishCastInput = z.infer<typeof publishCastSchema>;
