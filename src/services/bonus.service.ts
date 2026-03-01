import { BonusTransaction } from '../models/BonusTransaction';
import { sequelize } from '../db';
import { Op } from 'sequelize';


type AppError = Error & { status?: number };

function createAppError(message: string, status: number): AppError {
  const error = new Error(message) as AppError;
  error.status = status;
  return error;
}

export async function getUserBalance(userId: string): Promise<number> {
const transactions = await BonusTransaction.findAll({
  where: { user_id: userId },
});

const now = new Date();

const accruals = transactions
  .filter(tx => tx.type === 'accrual')
  .filter(tx => !tx.expires_at || tx.expires_at > now)
  .reduce((sum, tx) => sum + tx.amount, 0);

const spends = transactions
  .filter(tx => tx.type === 'spend')
  .reduce((sum, tx) => sum + tx.amount, 0);

return accruals - spends;
}

export async function spendBonus(
  userId: string,
  amount: number,
  requestId: string
): Promise<{ success: boolean; duplicated: boolean }> {

  return sequelize.transaction(async (t) => {

    // Проверяем duplicate request
    const existing = await BonusTransaction.findOne({
      where: {
        user_id: userId,
        request_id: requestId,
        type: 'spend',
      },

      transaction: t,
    });

    if (existing) {
      return {
        success: true,
        duplicated: true,
      };
    }

    // Получаем баланс внутри транзакции
    const transactions = await BonusTransaction.findAll({
      where: { user_id: userId },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    const now = new Date();

    const accruals = transactions
      .filter(tx => tx.type === 'accrual')
      .filter(tx => !tx.expires_at || tx.expires_at > now)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const spends = transactions
      .filter(tx => tx.type === 'spend')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const balance = accruals - spends;

    if (balance < amount) {
      throw createAppError('Not enough bonus', 400);
    }



    // Создаем списание
    await BonusTransaction.create(
      {
        user_id: userId,
        type: 'spend',
        amount,
        expires_at: null,
        request_id: requestId,
      },
      { transaction: t }
    );

    return {
      success: true,
      duplicated: false,
    };
  });
}
