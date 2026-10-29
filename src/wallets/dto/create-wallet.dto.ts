import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const E164 = /^\+[1-9]\d{7,14}$/;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateWalletDto {
  @ApiPropertyOptional({
    example: 'ada@example.com',
    description: 'Required unless phoneNumber is given. Stored lower-cased.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ValidateIf(
    (dto: CreateWalletDto) => dto.email !== undefined || !dto.phoneNumber,
  )
  @IsEmail(
    {},
    { message: 'email must be a valid email address (or provide phoneNumber)' },
  )
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'E.164 format. Required unless email is given.',
  })
  @Transform(trim)
  @IsOptional()
  @Matches(E164, {
    message: 'phoneNumber must be in E.164 format, e.g. +2348012345678',
  })
  phoneNumber?: string;
}
