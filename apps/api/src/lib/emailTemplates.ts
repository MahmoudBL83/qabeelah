/**
 * Professional HTML email templates for Qabila
 * All templates support Arabic and English
 */

interface TemplateVars {
  [key: string]: string | number;
}

const unsubscribeSection = (vars: TemplateVars) =>
  vars.unsubscribeUrl
    ? `<p style="margin: 8px 0 0 0; color: #666; font-size: 12px;"><a href="${vars.unsubscribeUrl}" style="color: #666;">إلغاء الاشتراك من رسائل البريد</a></p>`
    : '';

const baseStyle = `
  font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1b1c19;
  line-height: 1.6;
`;

const buttonStyle = `
  display: inline-block;
  padding: 12px 32px;
  background-color: #000000;
  color: #ffffff;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 600;
  margin: 20px 0;
`;

const containerStyle = `
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 20px;
  background-color: #fbf9f4;
`;

const headerStyle = `
  text-align: center;
  margin-bottom: 40px;
  border-bottom: 2px solid #775a19;
  padding-bottom: 20px;
`;

/**
 * Welcome Email Template
 */
export const welcomeEmailTemplate = (vars: TemplateVars): string => {
  const { email, password, tenantName, loginUrl } = vars;
  
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>مرحبا بك في ${tenantName}</title>
    </head>
    <body style="${baseStyle}">
      <div style="${containerStyle}">
        <div style="${headerStyle}">
          <h1 style="margin: 0; font-size: 28px; color: #000000;">قبيلة ${tenantName}</h1>
          <p style="margin: 10px 0 0 0; color: #775a19;">مرحباً بك في عائلتنا</p>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 12px; border: 1px solid #c4c7c7;">
          <h2 style="color: #000000; margin-top: 0;">مرحباً بك! 👋</h2>
          
          <p style="font-size: 16px;">تم تفعيل حسابك بنجاح في شجرة عائلة ${tenantName}. نحن سعداء بانضمامك إلينا!</p>

          <div style="background-color: #f5efe4; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #775a19;">
            <p style="margin: 5px 0; font-size: 14px;"><strong>البريد الإلكتروني:</strong> ${email}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>كلمة المرور المؤقتة:</strong> <code style="background-color: #fff; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${password}</code></p>
          </div>

          <p style="color: #444748; font-size: 14px;">⚠️ نوصي بتغيير كلمة المرور بعد تسجيل الدخول لأول مرة من إعدادات الملف الشخصي.</p>

          <center>
            <a href="${loginUrl}" style="${buttonStyle}">تسجيل الدخول الآن</a>
          </center>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #c4c7c7; color: #444748; font-size: 14px;">
            <p style="margin: 10px 0;"><strong>ماذا يمكنك فعله الآن؟</strong></p>
            <ul style="margin: 10px 0; padding-right: 20px;">
              <li>اكتمل ملفك الشخصي</li>
              <li>استكشف شجرة العائلة</li>
              <li>تصل بالأحداث العائلية القادمة</li>
              <li>تواصل مع أفراد العائلة الآخرين</li>
            </ul>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; color: #444748; font-size: 12px; border-top: 1px solid #c4c7c7; padding-top: 20px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} قبيلة ${tenantName}. جميع الحقوق محفوظة.</p>
          <p style="margin: 5px 0 0 0; color: #999;">الرجاء عدم الرد على هذا البريد الإلكتروني</p>
          ${unsubscribeSection(vars)}
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Email Verification Template
 */
export const emailVerificationTemplate = (vars: TemplateVars): string => {
  const { email, verificationUrl, tenantName, code } = vars;
  
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تأكيد بريدك الإلكتروني</title>
    </head>
    <body style="${baseStyle}">
      <div style="${containerStyle}">
        <div style="${headerStyle}">
          <h1 style="margin: 0; font-size: 28px; color: #000000;">تحقق من بريدك الإلكتروني</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 12px; border: 1px solid #c4c7c7;">
          <p style="font-size: 16px;">مرحبا ${email}،</p>
          
          <p style="font-size: 16px;">شكراً لتسجيلك في ${tenantName}. للتحقق من بريدك الإلكتروني، الرجاء النقر على الزر أدناه:</p>

          <center>
            <a href="${verificationUrl}" style="${buttonStyle}">تأكيد البريد الإلكتروني</a>
          </center>

          <p style="color: #444748; font-size: 14px; text-align: center;">أو استخدم هذا الرمز: <code style="background-color: #f5efe4; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 16px; font-weight: bold;">${code}</code></p>

          <div style="background-color: #f5efe4; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; color: #444748; font-size: 12px;">
            صلاحية هذا الرابط لمدة 24 ساعة فقط
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; color: #444748; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} قبيلة ${tenantName}. جميع الحقوق محفوظة.</p>
          ${unsubscribeSection(vars)}
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Password Reset Template
 */
export const passwordResetTemplate = (vars: TemplateVars): string => {
  const { email, resetUrl, tenantName, code } = vars;
  
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>إعادة تعيين كلمة المرور</title>
    </head>
    <body style="${baseStyle}">
      <div style="${containerStyle}">
        <div style="${headerStyle}">
          <h1 style="margin: 0; font-size: 28px; color: #000000;">إعادة تعيين كلمة المرور</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 12px; border: 1px solid #c4c7c7;">
          <p style="font-size: 16px;">مرحبا،</p>
          
          <p style="font-size: 16px;">لقد طلبت إعادة تعيين كلمة المرور الخاصة بحسابك في ${tenantName}. انقر على الزر أدناه لإنشاء كلمة مرور جديدة:</p>

          <center>
            <a href="${resetUrl}" style="${buttonStyle}">إعادة تعيين كلمة المرور</a>
          </center>

          <div style="background-color: #ffe6e6; padding: 15px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #ba1a1a;">
            <p style="margin: 0; color: #ba1a1a; font-weight: 600;">⚠️ هام</p>
            <p style="margin: 5px 0 0 0; color: #ba1a1a; font-size: 14px;">إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد الإلكتروني.</p>
          </div>

          <p style="color: #444748; font-size: 14px; text-align: center;">الرمز: <code style="background-color: #f5efe4; padding: 8px 12px; border-radius: 4px; font-family: monospace;">${code}</code></p>

          <div style="background-color: #f5efe4; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; color: #444748; font-size: 12px;">
            صلاحية هذا الرابط لمدة 1 ساعة فقط
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; color: #444748; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} قبيلة ${tenantName}. جميع الحقوق محفوظة.</p>
          ${unsubscribeSection(vars)}
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Event Reminder Template
 */
export const eventReminderTemplate = (vars: TemplateVars): string => {
  const { eventTitle, eventDate, eventLocation, eventDescription, eventUrl, tenantName } = vars;
  
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تذكير: حدث عائلي قادم</title>
    </head>
    <body style="${baseStyle}">
      <div style="${containerStyle}">
        <div style="${headerStyle}">
          <h1 style="margin: 0; font-size: 28px; color: #000000;">📅 تذكير حدث عائلي</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 12px; border: 1px solid #c4c7c7;">
          <p style="font-size: 16px;">مرحبا،</p>
          
          <p style="font-size: 16px;">هناك حدث عائلي قادم في ${tenantName}!</p>

          <div style="background-color: #f5efe4; padding: 20px; border-radius: 12px; margin: 20px 0; border-right: 4px solid #775a19;">
            <h3 style="margin-top: 0; color: #000000;">${eventTitle}</h3>
            <p style="margin: 10px 0; font-size: 16px;">
              <strong>📅 التاريخ:</strong> ${eventDate}
            </p>
            <p style="margin: 10px 0; font-size: 16px;">
              <strong>📍 المكان:</strong> ${eventLocation}
            </p>
            ${eventDescription ? `<p style="margin: 10px 0; font-size: 14px; color: #444748;">${eventDescription}</p>` : ''}
          </div>

          <center>
            <a href="${eventUrl}" style="${buttonStyle}">عرض التفاصيل</a>
          </center>

          <p style="color: #444748; font-size: 14px; text-align: center;">تأكد من وضع علامة على تقويمك!</p>
        </div>

        <div style="text-align: center; margin-top: 30px; color: #444748; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} قبيلة ${tenantName}. جميع الحقوق محفوظة.</p>
          ${unsubscribeSection(vars)}
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Announcement Template
 */
export const announcementTemplate = (vars: TemplateVars): string => {
  const { title, message, contentUrl, tenantName } = vars;
  
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>إعلان جديد</title>
    </head>
    <body style="${baseStyle}">
      <div style="${containerStyle}">
        <div style="${headerStyle}">
          <h1 style="margin: 0; font-size: 28px; color: #000000;">📢 إعلان جديد</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 12px; border: 1px solid #c4c7c7;">
          <p style="font-size: 16px;">مرحبا،</p>
          
          <h3 style="color: #000000; margin-top: 20px;">${title}</h3>
          <p style="font-size: 16px; line-height: 1.8;">${message}</p>

          <center>
            <a href="${contentUrl}" style="${buttonStyle}">اقرأ المزيد</a>
          </center>
        </div>

        <div style="text-align: center; margin-top: 30px; color: #444748; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} قبيلة ${tenantName}. جميع الحقوق محفوظة.</p>
          ${unsubscribeSection(vars)}
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Join Request Approved Template
 */
export const joinRequestApprovedTemplate = (vars: TemplateVars): string => {
  const { memberName, tenantName, loginUrl } = vars;
  
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تم قبول طلب الانضمام</title>
    </head>
    <body style="${baseStyle}">
      <div style="${containerStyle}">
        <div style="${headerStyle}">
          <h1 style="margin: 0; font-size: 28px; color: #000000;">✅ مرحبا بك!</h1>
        </div>

        <div style="background-color: white; padding: 30px; border-radius: 12px; border: 1px solid #c4c7c7;">
          <p style="font-size: 16px;">مرحبا ${memberName}،</p>
          
          <p style="font-size: 16px; line-height: 1.8;">تم قبول طلب الانضمام إلى ${tenantName}! 🎉</p>

          <p style="font-size: 16px; line-height: 1.8;">يمكنك الآن الوصول إلى شجرة العائلة واستكشاف أنسابك والاتصال بأفراد عائلتك.</p>

          <center>
            <a href="${loginUrl}" style="${buttonStyle}">البدء الآن</a>
          </center>

          <div style="background-color: #f5efe4; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #775a19;">
            <p style="margin: 0; font-weight: 600;">💡 نصيحة:</p>
            <p style="margin: 10px 0 0 0; color: #444748; font-size: 14px;">اكتمل ملفك الشخصي وأضف صورتك لمساعدة أفراد عائلتك على التعرف عليك.</p>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; color: #444748; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} قبيلة ${tenantName}. جميع الحقوق محفوظة.</p>
          ${unsubscribeSection(vars)}
        </div>
      </div>
    </body>
    </html>
  `;
};
