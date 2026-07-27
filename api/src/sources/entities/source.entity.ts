/**
 * Внутренняя модель источника. Содержит secret, поэтому наружу
 * через контроллеры не отдаётся — только в виде SourceResponseDto.
 */
export interface Source {
  id: string;
  name: string;
  secret?: string;
  subscriberUrl?: string;
  createdAt: string;
}
