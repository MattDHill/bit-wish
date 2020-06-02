import {MigrationInterface, QueryRunner} from "typeorm";

export class init1591117528124 implements MigrationInterface {
    name = 'init1591117528124'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "fee_estimate" ("created_at" datetime PRIMARY KEY NOT NULL, "fee_obj" text NOT NULL)`, undefined);
        await queryRunner.query(`CREATE TABLE "messages" ("tweet_id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "user_handle" text NOT NULL, "created_at" datetime NOT NULL, "updated_at" datetime NOT NULL, "type" text NOT NULL, "text" text NOT NULL, "bitcoin_txid_1" text, "bitcoin_txid_2" text, "reply_tweet_id" text, "failed_error" text)`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_830a3c1d92614d1495418c4673" ON "messages" ("user_id") `, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_87183e91f31c528f4abc1cdc51" ON "messages" ("type") `, undefined);
        await queryRunner.query(`CREATE TABLE "utxos" ("txid" text PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL, "spent_at" datetime, "amount" integer NOT NULL, "raw_tx" text NOT NULL)`, undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "utxos"`, undefined);
        await queryRunner.query(`DROP INDEX "IDX_87183e91f31c528f4abc1cdc51"`, undefined);
        await queryRunner.query(`DROP INDEX "IDX_830a3c1d92614d1495418c4673"`, undefined);
        await queryRunner.query(`DROP TABLE "messages"`, undefined);
        await queryRunner.query(`DROP TABLE "fee_estimate"`, undefined);
    }

}
