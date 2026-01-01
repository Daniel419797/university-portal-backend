import axios from 'axios';
import { generateReference } from '../utils/helpers';
import logger from '../config/logger';
import { ApiError } from '../utils/ApiError';

interface PaymentData {
  email: string;
  amount: number;
  reference?: string;
  metadata?: Record<string, any>;
  callback_url?: string;
}

interface PaymentVerification {
  status: boolean;
  reference: string;
  amount: number;
  gateway_response?: string;
  paid_at?: string;
  channel?: string;
}

class PaymentService {
  private paystackSecretKey: string;
  private paystackBaseUrl: string;
  private isTestMode: boolean;

  constructor() {
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || '';
    this.paystackBaseUrl = 'https://api.paystack.co';
    this.isTestMode = process.env.NODE_ENV !== 'production' || !this.paystackSecretKey;
  }

  /**
   * Initialize a payment transaction (Mock or Paystack)
   * @param data - Payment initialization data
   * @returns Payment initialization response
   */
  async initializePayment(data: PaymentData) {
    const reference = data.reference || generateReference('PAY');

    // Mock payment in test/development mode
    if (this.isTestMode) {
      logger.info(`Mock payment initialized: ${reference}`);
      return {
        status: true,
        message: 'Mock payment initialized successfully',
        data: {
          authorization_url: `${process.env.CLIENT_URL}/payment/mock?reference=${reference}`,
          access_code: `mock_${reference}`,
          reference,
        },
      };
    }

    // Real Paystack integration
    try {
      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email: data.email,
          amount: data.amount * 100, // Convert to kobo
          reference,
          metadata: data.metadata,
          callback_url: data.callback_url || process.env.PAYSTACK_CALLBACK_URL,
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Paystack initialization error:', error.response?.data || error.message);
      throw ApiError.internal('Payment initialization failed');
    }
  }

  /**
   * Verify a payment transaction (Mock or Paystack)
   * @param reference - Payment reference
   * @returns Payment verification result
   */
  async verifyPayment(reference: string): Promise<PaymentVerification> {
    // Mock payment verification
    if (this.isTestMode) {
      logger.info(`Mock payment verified: ${reference}`);
      
      // Simulate different payment statuses for testing
      const mockStatus = reference.includes('fail') ? false : true;
      
      return {
        status: mockStatus,
        reference,
        amount: 50000, // Mock amount in kobo (500 NGN)
        gateway_response: mockStatus ? 'Successful' : 'Failed',
        paid_at: new Date().toISOString(),
        channel: 'mock',
      };
    }

    // Real Paystack verification
    try {
      const response = await axios.get(`${this.paystackBaseUrl}/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      });

      const { data } = response.data;

      return {
        status: data.status === 'success',
        reference: data.reference,
        amount: data.amount / 100, // Convert from kobo
        gateway_response: data.gateway_response,
        paid_at: data.paid_at,
        channel: data.channel,
      };
    } catch (error: any) {
      logger.error('Paystack verification error:', error.response?.data || error.message);
      throw ApiError.internal('Payment verification failed');
    }
  }

  /**
   * Get list of supported banks (Paystack)
   * @returns List of banks
   */
  async getBanks() {
    if (this.isTestMode) {
      // Return mock banks for testing
      return {
        status: true,
        message: 'Mock banks retrieved',
        data: [
          { name: 'Access Bank', code: '044', id: 1 },
          { name: 'GTBank', code: '058', id: 2 },
          { name: 'First Bank', code: '011', id: 3 },
          { name: 'UBA', code: '033', id: 4 },
          { name: 'Zenith Bank', code: '057', id: 5 },
        ],
      };
    }

    try {
      const response = await axios.get(`${this.paystackBaseUrl}/bank`, {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Paystack get banks error:', error.response?.data || error.message);
      throw ApiError.internal('Failed to retrieve banks');
    }
  }

  /**
   * Verify bank account number (Paystack)
   * @param accountNumber - Account number
   * @param bankCode - Bank code
   * @returns Account details
   */
  async verifyBankAccount(accountNumber: string, bankCode: string) {
    if (this.isTestMode) {
      return {
        status: true,
        message: 'Mock account verification',
        data: {
          account_number: accountNumber,
          account_name: 'John Doe',
          bank_id: 1,
        },
      };
    }

    try {
      const response = await axios.get(
        `${this.paystackBaseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Paystack account verification error:', error.response?.data || error.message);
      throw ApiError.internal('Bank account verification failed');
    }
  }

  /**
   * Generate payment receipt data
   * @param paymentDetails - Payment details
   * @returns Formatted receipt data
   */
  generateReceipt(paymentDetails: any) {
    return {
      receiptNumber: `REC-${paymentDetails.reference}`,
      studentName: paymentDetails.studentName,
      studentId: paymentDetails.studentId,
      paymentType: paymentDetails.type,
      amount: paymentDetails.amount,
      reference: paymentDetails.reference,
      paymentDate: paymentDetails.paymentDate,
      status: paymentDetails.status,
      session: paymentDetails.session,
      semester: paymentDetails.semester,
      verifiedBy: paymentDetails.verifiedBy,
      verifiedAt: paymentDetails.verifiedAt,
    };
  }

  /**
   * Calculate fee breakdown
   * @param feeType - Type of fee
   * @param level - Student level
   * @returns Fee breakdown
   */
  calculateFee(feeType: string, level?: number) {
    const fees: Record<string, number> = {
      tuition: 150000,
      hostel: 50000,
      library: 5000,
      medical: 10000,
      sports: 5000,
      exam: 2000,
      late_registration: 5000,
    };

    const baseFee = fees[feeType] || 0;
    
    // Add level-based pricing if needed
    if (feeType === 'tuition' && level) {
      const levelMultiplier = level >= 300 ? 1.2 : 1.0;
      return baseFee * levelMultiplier;
    }

    return baseFee;
  }

  /**
   * Check if student has paid required fees
   * @param _studentId - Student ID (reserved for future implementation)
   * @param requiredFees - Array of required fee types
   * @returns Payment status
   */
  async checkPaymentStatus(_studentId: string, requiredFees: string[]) {
    // This would typically query the Payment model
    // Implementation depends on your specific requirements
    return {
      hasPaid: false,
      missingFees: requiredFees,
      message: 'Payment status check - implement based on business logic',
    };
  }
}

export default new PaymentService();
